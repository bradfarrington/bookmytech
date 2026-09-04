// Does a HaynesPro repair-tree node id mean the SAME job on every vehicle?
// (Task 23 gate.) Global hides in repair_vehicle_exclusions are keyed on the
// node id alone, so a hide written while looking at a Golf must hit the same
// repair on a Ranger. This proves — or disproves — that against the live API.
//
//   node scripts/verify-repair-node-ids.mjs
//   node scripts/verify-repair-node-ids.mjs --types 26650,31234   # skip discovery
//   node scripts/verify-repair-node-ids.mjs --a "VOLKSWAGEN|Golf VII" --b "FORD|Ranger"
//
// What it checks, for two car types A and B of different makes:
//   1. Root groups: every id present on BOTH vehicles carries the same
//      description. Ids present on only one are fine (coverage differs).
//   2. The timed leaf "front brake pads" under Brakes: same id on both.
//   3. The decisive check — getRepairtimeNodesV4 on B with A's leaf id returns
//      the same job with a time. This is exactly what quoteRepair does.
//   4. Informational: do leaf ids share a prefix with their parent group id.
//
// Exit 0 = PASS, 1 = FAIL (ids are per-vehicle → see the fallback design in
// docs/tasks/23-global-repair-hides.md), 2 = config/discovery problem.
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

async function discoverType(spec) {
  const [makeWanted, modelWanted] = spec.split("|").map((s) => s.trim());
  const makes = await hp.getMakes();
  const make = makes.find((m) => norm(m.name) === norm(makeWanted));
  if (!make) {
    console.error(`Make "${makeWanted}" not found. Have: ${makes.map((m) => m.name).join(", ")}`);
    process.exit(2);
  }
  const models = await hp.getMakeModels(make.id);
  const model =
    models.find((m) => norm(m.name) === norm(modelWanted)) ??
    models.find((m) => norm(m.name).startsWith(norm(modelWanted))) ??
    models.find((m) => norm(m.name).includes(norm(modelWanted)));
  if (!model) {
    console.error(
      `Model "${modelWanted}" not found under ${make.name}. Have: ${models.map((m) => m.name).join(" | ")}`,
    );
    process.exit(2);
  }
  const { types } = await hp.getModelTypes(model.id);
  if (types.length === 0) {
    console.error(`No engine variants under ${make.name} ${model.name}`);
    process.exit(2);
  }
  return types[0].id;
}

async function describeType(carTypeId) {
  const node = await hp.getCarTypeNode(carTypeId);
  const repairtimeTypeId = await hp.getRepairtimeTypeId(carTypeId);
  return {
    carTypeId,
    label: node?.fullName ?? node?.name ?? `type ${carTypeId}`,
    repairtimeTypeId,
  };
}

/** Bounded walk under `startId` collecting timed leaves (id, awNumber, description, value, parentId). */
async function collectLeaves(repairtimeTypeId, startId, maxExpansions = 60) {
  const leaves = [];
  const queue = [startId];
  let expansions = 0;
  while (queue.length && expansions < maxExpansions) {
    const id = queue.shift();
    expansions += 1;
    const nodes = await hp.getSubnodes(repairtimeTypeId, id);
    for (const n of nodes) {
      if (n.id == null) continue;
      if (n.hasSubnodes) queue.push(n.id);
      else leaves.push({ ...n, parentId: id });
    }
  }
  return leaves;
}

function findGroup(nodes, pattern) {
  return nodes.find((n) => n.hasSubnodes && pattern.test(n.description ?? ""));
}

async function main() {
  let typeA;
  let typeB;
  const explicit = arg("--types");
  if (explicit) {
    [typeA, typeB] = explicit.split(",").map((s) => Number.parseInt(s.trim(), 10));
  } else {
    typeA = await discoverType(arg("--a") ?? "VOLKSWAGEN|Golf VII");
    typeB = await discoverType(arg("--b") ?? "FORD|Ranger");
  }

  const A = await describeType(typeA);
  const B = await describeType(typeB);
  console.log(`A: ${A.label} (carTypeId ${A.carTypeId}, repairtimeTypeId ${A.repairtimeTypeId})`);
  console.log(`B: ${B.label} (carTypeId ${B.carTypeId}, repairtimeTypeId ${B.repairtimeTypeId})`);
  if (A.repairtimeTypeId == null || B.repairtimeTypeId == null) {
    console.error("One of the vehicles has no repair-times coverage — pick different types.");
    process.exit(2);
  }

  // 1. Root groups.
  console.log("\n1. Root groups");
  const [rootA, rootB] = await Promise.all([
    hp.getSubnodes(A.repairtimeTypeId, "root"),
    hp.getSubnodes(B.repairtimeTypeId, "root"),
  ]);
  const byIdB = new Map(rootB.map((n) => [n.id, n]));
  const shared = rootA.filter((n) => byIdB.has(n.id));
  const onlyA = rootA.filter((n) => !byIdB.has(n.id));
  const onlyB = rootB.filter((n) => !rootA.some((a) => a.id === n.id));
  const mismatched = shared.filter(
    (n) => norm(n.description) !== norm(byIdB.get(n.id).description),
  );
  console.log(`   A has ${rootA.length} groups, B has ${rootB.length}; ${shared.length} ids in both`);
  for (const n of shared) {
    const b = byIdB.get(n.id);
    const same = norm(n.description) === norm(b.description);
    console.log(`   ${same ? " " : "!"} ${String(n.id).padEnd(16)} ${n.description}${same ? "" : `  ≠  ${b.description}`}`);
  }
  if (onlyA.length) console.log(`   only A: ${onlyA.map((n) => `${n.id} ${n.description}`).join(" | ")}`);
  if (onlyB.length) console.log(`   only B: ${onlyB.map((n) => `${n.id} ${n.description}`).join(" | ")}`);
  check("shared root ids describe the same group", mismatched.length === 0, `${mismatched.length} mismatched`);
  check("most root groups are shared", shared.length >= Math.min(rootA.length, rootB.length) * 0.6, `${shared.length} shared`);

  // 2. Front brake pads leaf on both.
  console.log("\n2. Front brake pads leaf");
  const brakePattern = /brake/i;
  const padsPattern = /front.*brake pads|brake pads.*front|front pads/i;
  const groupA = findGroup(rootA, brakePattern);
  const groupB = findGroup(rootB, brakePattern);
  if (!groupA || !groupB) {
    console.error("No Brakes group on one of the vehicles.");
    process.exit(2);
  }
  console.log(`   Brakes group: A ${groupA.id} "${groupA.description}" · B ${groupB.id} "${groupB.description}"`);
  check("Brakes group id matches", groupA.id === groupB.id, `${groupA.id} vs ${groupB.id}`);

  const [leavesA, leavesB] = await Promise.all([
    collectLeaves(A.repairtimeTypeId, groupA.id),
    collectLeaves(B.repairtimeTypeId, groupB.id),
  ]);
  const padsA = leavesA.find((n) => padsPattern.test(n.description ?? ""));
  const padsB = leavesB.find((n) => padsPattern.test(n.description ?? ""));
  console.log(`   A leaves under Brakes: ${leavesA.length}; B: ${leavesB.length}`);
  const show = (n) =>
    n ? `${n.id} aw=${n.awNumber ?? "-"} ${n.value ?? "-"} "${n.description}" (parent ${n.parentId})` : "not found";
  console.log(`   A pads: ${show(padsA)}`);
  console.log(`   B pads: ${show(padsB)}`);
  if (!padsA || !padsB) {
    console.log("   sample A leaves:", leavesA.slice(0, 8).map((n) => `${n.id} ${n.description}`).join(" | "));
    console.log("   sample B leaves:", leavesB.slice(0, 8).map((n) => `${n.id} ${n.description}`).join(" | "));
    process.exit(2);
  }
  check("front brake pads leaf id matches", padsA.id === padsB.id, `${padsA.id} vs ${padsB.id}`);

  // Every leaf id shared under Brakes must describe the same job. HaynesPro
  // decorates the same operation differently per vehicle — a trailing "*"
  // marker, or a variant qualifier appended ("Renew the brake servo Manual
  // transmission, RHD" vs "Renew the brake servo") — so two descriptions are
  // the same job when, stripped of the marker, one is a prefix of the other.
  const sameJob = (a, b) => {
    const x = norm(a).replace(/\*+$/, "").trim();
    const y = norm(b).replace(/\*+$/, "").trim();
    return x === y || x.startsWith(y) || y.startsWith(x);
  };
  const leafB = new Map(leavesB.map((n) => [n.id, n]));
  const sharedLeaves = leavesA.filter((n) => leafB.has(n.id));
  const badLeaves = sharedLeaves.filter(
    (n) => !sameJob(n.description, leafB.get(n.id).description),
  );
  for (const n of badLeaves) {
    console.log(`   ! ${n.id} "${n.description}" ≠ "${leafB.get(n.id).description}"`);
  }
  check(
    `shared leaf ids under Brakes describe the same job (${sharedLeaves.length} shared)`,
    badLeaves.length === 0,
    `${badLeaves.length} mismatched`,
  );

  // 3. The quoteRepair path: look B up by A's id.
  console.log("\n3. getRepairtimeNodesV4 on B with A's leaf id");
  const byId = await hp.getNodesByIds(B.repairtimeTypeId, [padsA.id]);
  const hit = byId.find((n) => n.id === padsA.id) ?? byId[0];
  console.log(`   → ${hit ? show({ ...hit, parentId: "?" }) : "nothing"}`);
  check(
    "B returns the same job for A's id, with a time",
    !!hit && norm(hit.description) === norm(padsA.description) && typeof hit.value === "number" && hit.value > 0,
  );

  // 4. Informational: id structure.
  console.log("\n4. Id structure (informational)");
  const prefixLen = Math.min(String(padsA.parentId).length, String(padsA.id).length);
  const sharesPrefix = String(padsA.id).slice(0, 4) === String(padsA.parentId).slice(0, 4);
  console.log(`   leaf ${padsA.id} under group ${padsA.parentId} — first 4 chars ${sharesPrefix ? "match" : "differ"} (compared ${prefixLen} chars available)`);

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check${failures === 1 ? "" : "s"}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
