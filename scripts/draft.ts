// Usage: npm run draft <YYYY-MM-DD>   — creates a 2-week draft and greedily fills every
// demanded slot with the top-ranked eligible regular worker. P2-lite: it uses the same
// ranker Gordon sees in the UI, so what it does is explainable slot by slot.
import { loadFacility, createSchedule, listAssignments, addAssignment } from "../src/db/repo";
import { rankForSlot } from "../src/domain/rank";
import { validate, slotsFor } from "../src/domain/validate";
import { weekStart } from "../src/domain/time";

const start = weekStart(process.argv[2] ?? new Date().toISOString().slice(0, 10));
const f = loadFacility();
const s = createSchedule(start);
const slots = slotsFor(f, s).filter((x) => x.demand > 0).sort((a, b) => a.date.localeCompare(b.date));
for (const slot of slots) {
  for (let i = 0; i < slot.demand; i++) {
    const cur = listAssignments(s.id);
    const top = rankForSlot(f, s, cur, slot.date, slot.shiftId).find((c) => c.eligible && c.mode === "regular");
    if (!top) { console.log(`no eligible regular staff for ${slot.date} ${slot.shiftId}`); break; }
    const { id: _drop, ...a } = top.assignment; void _drop;
    addAssignment(a);
  }
}
const vs = validate(f, s, listAssignments(s.id));
console.log(`draft ${s.id} for ${start}: ${vs.filter((v) => v.severity === "hard").length} hard, ${vs.filter((v) => v.severity === "soft").length} soft`);
console.log(`open http://localhost:3000/?s=${s.id}`);
