// Generate the 0061 seed from the extracted checklist documents.
import { readFileSync } from "node:fs";
const dir = process.argv[2] ?? "docs/checklists/extracted";

const FIX = [
  [/Replaceoil/g, "Replace oil"], [/Checktread/g, "Check tread"], [/Tyrepressures/g, "Tyre pressures"],
  [/ofHeadlights/g, "of headlights"], [/ofdirectional/g, "of directional"], [/serpentineBeltfor/g, "serpentine belt for"],
  [/ServiceInterval/g, "Service Interval"], [/Checktiming beltinterval/g, "Check timing belt interval"],
  [/ForSponginess/g, "For Sponginess"], [/modulescan/g, "module scan"], [/drainagechannels/g, "drainage channels"],
  [/overheatingevidence/g, "overheating evidence"], [/jackingpoints/g, "jacking points"], [/orsunroof/g, "or sunroof"],
  [/CVjoints/g, "CV joints"], [/andjacking/g, "and jacking"], [/windshield/g, "windscreen"], [/tire/g, "tyre"], [/Tire/g, "Tyre"],
  [/top off/g, "top up"], [/under-hood/g, "under-bonnet"],
];
const clean = (s) => {
  let t = s.replace(/^\d+\)\s*/, "").replace(/\s+/g, " ").trim().replace(/[,;.]+$/, "").trim();
  for (const [re, to] of FIX) t = t.replace(re, to);
  return t;
};
const q = (s) => `'${s.replace(/'/g, "''")}'`;

const services = [
  ["interim_service", "Interim service checklist", "Interim_service.txt"],
  ["full_service", "Full service checklist", "full_service.txt"],
  ["major_service", "Major service checklist", "major_service.txt"],
];
const out = [];
out.push("insert into public.checklists (key, name, kind) values");
out.push(
  [...services.map(([k, n]) => `  (${q(k)}, ${q(n)}, 'service')`), "  ('pre_purchase_inspection', 'Pre-purchase inspection', 'inspection')"].join(",\n") +
    "\non conflict (key) do nothing;",
);

for (const [key, , file] of services) {
  const lines = readFileSync(`${dir}/${file}`, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
  const items = lines.slice(1).filter((l) => !/^\d+ (point check|Checks)$/i.test(l)).map(clean).filter(Boolean);
  const seen = new Set();
  const rows = [];
  for (const label of items) {
    const k = label.toLowerCase();
    if (seen.has(k)) { console.error(`dup in ${key}: ${label}`); continue; }
    seen.add(k);
    rows.push(label);
  }
  console.error(`${key}: ${rows.length} items`);
  out.push(`\n-- ${key}: ${rows.length} items`);
  out.push("insert into public.checklist_items (checklist_id, section, label, position, tiers)");
  out.push(`select c.id, 'Checks', v.label, v.position, null from public.checklists c,\n  (values`);
  out.push(rows.map((label, i) => `    (${q(label)}, ${i})`).join(",\n"));
  out.push(`  ) as v(label, position)\nwhere c.key = ${q(key)}\non conflict (checklist_id, section, label) do nothing;`);
}

// Inspection: sections + tiers.
const insp = readFileSync(`${dir}/pre_purchase_inspection3.txt`, "utf8").split("\n");
const rows = [];
let section = null;
let pending = null; // { label, cells: [] }
const flush = () => {
  if (!pending) return;
  const cells = pending.cells;
  const tiers = [];
  if (cells[0]?.toLowerCase() === "y") tiers.push("bronze");
  if (cells[1]?.toLowerCase() === "y") tiers.push("silver");
  if (cells[2]?.toLowerCase() === "y") tiers.push("gold");
  if (tiers.length) rows.push({ section, label: clean(pending.label), tiers });
  else console.error("no tiers:", pending.label);
  pending = null;
};
for (let i = 0; i < insp.length; i++) {
  const raw = insp[i];
  const line = raw.trim();
  if (!line || /Pre-Purchase Inspection checklist/i.test(line)) continue;
  if (/^Our price/.test(line)) { flush(); break; }
  if (line.startsWith("|")) {
    // cell row: " | y", " |  | y", " |  |  | y", " | Bronze", " | "
    if (!pending) continue;
    const cells = line.split("|").slice(1).map((c) => c.trim());
    if (cells.some((c) => /^(Bronze|Silver|Gold)$/i.test(c))) { pending = null; continue; }
    pending.cells.push(...cells);
    continue;
  }
  // a label line
  flush();
  const next = insp[i + 1]?.trim() ?? "";
  if (/\|\s*Bronze/.test(next)) { section = clean(line).replace(/^transmission/, "Transmission"); continue; }
  pending = { label: line, cells: [] };
}
flush();
// Only 3 cells per row matter; extra empty cells were trailing separators.
const seen = new Set();
const uniq = rows.filter((r) => {
  const k = `${r.section}|${r.label.toLowerCase()}`;
  if (seen.has(k)) { console.error("dup inspection:", k); return false; }
  seen.add(k);
  return true;
});
const bySection = new Map();
for (const r of uniq) bySection.set(r.section, (bySection.get(r.section) ?? 0) + 1);
console.error("inspection sections:", [...bySection.entries()].map(([s, n]) => `${s} (${n})`).join(", "));
const count = (t) => uniq.filter((r) => r.tiers.includes(t)).length;
console.error(`inspection: ${uniq.length} items · bronze ${count("bronze")} · silver ${count("silver")} · gold ${count("gold")}`);
out.push(`\n-- pre_purchase_inspection: ${uniq.length} items in ${bySection.size} sections (bronze ${count("bronze")}, silver ${count("silver")}, gold ${count("gold")})`);
out.push("insert into public.checklist_items (checklist_id, section, label, position, tiers)");
out.push("select c.id, v.section, v.label, v.position, v.tiers from public.checklists c,\n  (values");
out.push(uniq.map((r, i) => `    (${q(r.section)}, ${q(r.label)}, ${i}, array[${r.tiers.map((t) => `'${t}'`).join(",")}]::text[])`).join(",\n"));
out.push("  ) as v(section, label, position, tiers)\nwhere c.key = 'pre_purchase_inspection'\non conflict (checklist_id, section, label) do nothing;");
console.log(out.join("\n"));
