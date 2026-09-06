// Usage: npm run validate [scheduleId]   — prints violations for a schedule (default: latest)
import { loadFacility, listSchedules, getSchedule, listAssignments } from "../src/db/repo";
import { validate } from "../src/domain/validate";

const id = process.argv[2] ?? listSchedules()[0]?.id;
if (!id) { console.log("no schedules yet"); process.exit(0); }
const s = getSchedule(id)!;
const vs = validate(loadFacility(), s, listAssignments(id));
const hard = vs.filter((v) => v.severity === "hard");
const soft = vs.filter((v) => v.severity === "soft");
console.log(`schedule ${s.id} (${s.startDate}, ${s.status}): ${hard.length} hard, ${soft.length} soft`);
for (const v of [...hard, ...soft]) console.log(`${v.severity === "hard" ? "!!" : " ~"} [${v.code}] ${v.message}${v.quote ? `  ← "${v.quote}"` : ""}`);
