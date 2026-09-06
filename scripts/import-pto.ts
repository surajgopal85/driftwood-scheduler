// Usage: npm run pto:import path/to/pto.csv   (columns: name,start,end[,reason])
// Names are matched against worker aliases. Unmatched names are listed, not guessed.
import fs from "node:fs";
import { loadFacility, replacePto } from "../src/db/repo";

const file = process.argv[2];
if (!file) { console.error("usage: pto:import <csv>"); process.exit(1); }
const f = loadFacility();
const alias = new Map<string, string>();
for (const w of f.workers) for (const a of w.aliases) alias.set(a.toLowerCase().trim(), w.id);

const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).slice(1);
const out: { workerId: string; start: string; end: string }[] = [];
const unmatched = new Set<string>();
for (const line of lines) {
  const [name, start, end] = line.split(",");
  const id = alias.get(name.toLowerCase().trim());
  if (!id) { unmatched.add(name); continue; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) { console.warn(`skip bad dates: ${line}`); continue; }
  out.push({ workerId: id, start, end });
}
replacePto(out);
console.log(`imported ${out.length} PTO ranges`);
if (unmatched.size) console.log(`unmatched names (add to aliases in data/facility.json): ${[...unmatched].join(", ")}`);
