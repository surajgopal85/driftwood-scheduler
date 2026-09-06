// Usage: npm run rules:apply rules/v0.2.json [--from 2026-09-08] [--dry]
// Diffs the file against currently-active rules by `key`. Never mutates content:
//   unchanged -> skip | changed -> insert new (supersedes old), close old
//   new -> insert    | missing from file -> close old (retired)
import { activeRules, insertRule, closeRule, uid } from "../src/db/repo";
import { readRuleFile, contentSig, materialize } from "./_load";
import { addDays } from "../src/domain/time";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) { console.error("usage: rules:apply <rules.json> [--from YYYY-MM-DD] [--dry]"); process.exit(1); }
const dry = args.includes("--dry");
const fromIdx = args.indexOf("--from");
const rf = readRuleFile(file);
const from = fromIdx >= 0 ? args[fromIdx + 1] : rf.effectiveFrom;
const dayBefore = addDays(from, -1);

const active = new Map(activeRules(from).map((r) => [r.key, r]));
const seen = new Set<string>();
let added = 0, changed = 0, retired = 0, same = 0;

for (const e of rf.rules) {
  seen.add(e.key);
  const candidate = materialize(e, uid("rule"), from, null);
  const cur = active.get(e.key);
  if (!cur) {
    added++; console.log(`+ ${e.key}`);
    if (!dry) insertRule(candidate);
  } else if (contentSig(cur) !== contentSig(candidate)) {
    changed++; console.log(`~ ${e.key}  (supersedes ${cur.id})`);
    if (!dry) { closeRule(cur.id, dayBefore); insertRule({ ...candidate, supersedes: cur.id }); }
  } else { same++; }
}
for (const [key, cur] of active) {
  if (seen.has(key)) continue;
  retired++; console.log(`- ${key}  (retired ${dayBefore})`);
  if (!dry) closeRule(cur.id, dayBefore);
}
console.log(`\n${rf.version} effective ${from}: +${added} ~${changed} -${retired} =${same}${dry ? "  (dry run)" : ""}`);
