// Does HaynesPro's basket calculation (processRepairTasksV4) remove the
// overlap between jobs booked together? (Task 24.) Multi-job bookings price
// from its totalRepairTime, so this proves the operation is licensed, answers
// in the shape lib/haynespro/combine.ts expects, and behaves sensibly on three
// baskets for one vehicle:
//
//   discs + pads        → total LESS than the sum (renewing the discs already
//                         takes the pads off — the pads line should be 0)
//   pads alone          → the leaf's own book time
//   front + rear pads   → a plain sum (nothing overlaps)
//
//   node scripts/verify-repair-combination.mjs
//   node scripts/verify-repair-combination.mjs --type 317000222   # a specific car type
//
// Defaults to the VW Golf VII 1.0 TSI used for scripts/verify-repair-node-ids.mjs.
// Exact times drift with HaynesPro's quarterly updates, so the checks are
// structural; the numbers are printed for the task md.
//
// Exit 0 = PASS, 1 = FAIL, 2 = config/discovery problem.
import { createHaynesProRest, norm } from "./lib/haynespro-rest.mjs";

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const hp = createHaynesProRest();
let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures += 1;
}

const BRAKES_GROUP = "1M2"; // "Brakes (Mechanical)" — same id on every make (Task 23 check)

async function findLeaf(repairtimeTypeId, subgroupPattern, leafPattern) {
  const groups = await hp.getSubnodes(repairtimeTypeId, BRAKES_GROUP);
  const group = groups.find((g) => g.hasSubnodes && subgroupPattern.test(g.description ?? ""));
  if (!group) return null;
  const leaves = (await hp.getSubnodes(repairtimeTypeId, group.id)).filter((n) => !n.hasSubnodes);
  return leaves.find((n) => leafPattern.test(n.description ?? "")) ?? null;
}

async function basket(repairtimeTypeId, ids) {
  return hp.call("processRepairTasksV4", {
    descriptionLanguage: "en",
    repairtimeTypeId,
    typeCategory: "CAR",
    repairTaskIds: ids,
    repairVatRates: ids.map(() => 20),
    labourRateMechanical: 6000,
    labourRateBody: 6000,
    labourRateElectronics: 6000,
  });
}

function describeBasket(label, reply) {
  console.log(`\n${label}`);
  if (!reply || typeof reply !== "object" || Array.isArray(reply)) {
    console.log("   (not an object reply)", JSON.stringify(reply)?.slice(0, 200));
    return;
  }
  console.log(`   statusCode ${reply.status?.statusCode ?? "-"} · totalRepairTime ${reply.totalRepairTime}`);
  for (const item of reply.basketItems ?? []) {
    console.log(`   ${String(item.id).padEnd(16)} calculatedTime ${String(item.calculatedTime).padStart(4)}  ${item.description}`);
  }
}

async function main() {
  const carTypeId = Number.parseInt(arg("--type") ?? "317000222", 10);
  const type = await hp.getCarTypeNode(carTypeId);
  const repairtimeTypeId = await hp.getRepairtimeTypeId(carTypeId);
  console.log(`${type?.fullName ?? `type ${carTypeId}`} — carTypeId ${carTypeId}, repairtimeTypeId ${repairtimeTypeId}`);
  if (repairtimeTypeId == null) {
    console.error("No repair-times coverage for this type.");
    process.exit(2);
  }

  const [discs, pads, rearPads] = await Promise.all([
    findLeaf(repairtimeTypeId, /disc/i, /renew both front brake discs/i),
    findLeaf(repairtimeTypeId, /pad/i, /^renew the front brake pads$/i),
    findLeaf(repairtimeTypeId, /pad/i, /^renew the rear brake pads$/i),
  ]);
  for (const [name, leaf] of [["discs", discs], ["front pads", pads], ["rear pads", rearPads]]) {
    console.log(`   ${name.padEnd(10)} ${leaf ? `${leaf.id} (${leaf.value}) "${leaf.description}"` : "NOT FOUND"}`);
  }
  if (!discs || !pads || !rearPads) process.exit(2);

  const overlapping = await basket(repairtimeTypeId, [discs.id, pads.id]);
  describeBasket("1. discs + front pads (overlap expected)", overlapping);
  const items = new Map((overlapping?.basketItems ?? []).map((i) => [i.id, i]));
  check("reply is an object with statusCode 0", overlapping?.status?.statusCode === 0);
  check("both ids come back, matched by id", items.has(discs.id) && items.has(pads.id));
  check(
    "total is less than the plain sum",
    typeof overlapping?.totalRepairTime === "number" && overlapping.totalRepairTime < discs.value + pads.value,
    `${overlapping?.totalRepairTime} vs ${discs.value + pads.value}`,
  );
  check(
    "the pads line is reduced (covered by the discs job)",
    (items.get(pads.id)?.calculatedTime ?? Infinity) < pads.value,
    `${items.get(pads.id)?.calculatedTime} vs ${pads.value}`,
  );
  check(
    "total equals the sum of calculatedTime",
    overlapping?.totalRepairTime === [...items.values()].reduce((n, i) => n + (i.calculatedTime ?? 0), 0),
  );

  const single = await basket(repairtimeTypeId, [pads.id]);
  describeBasket("2. front pads alone", single);
  check("single job equals the leaf's own time", single?.totalRepairTime === pads.value, `${single?.totalRepairTime} vs ${pads.value}`);

  const disjoint = await basket(repairtimeTypeId, [pads.id, rearPads.id]);
  describeBasket("3. front + rear pads (no overlap expected)", disjoint);
  check(
    "disjoint jobs are a plain sum",
    disjoint?.totalRepairTime === pads.value + rearPads.value,
    `${disjoint?.totalRepairTime} vs ${pads.value + rearPads.value}`,
  );
  const descriptionsMatch = (disjoint?.basketItems ?? []).every((i) =>
    [pads, rearPads].some((leaf) => leaf.id === i.id && norm(leaf.description) === norm(i.description)),
  );
  check("basket descriptions match the tree's", descriptionsMatch);

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check${failures === 1 ? "" : "s"}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
