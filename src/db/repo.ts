import { db, uid } from "./index";
import type { Assignment, Facility, Pto, Rule, Schedule, ShiftTemplate, Worker } from "@/domain/types";
import { FOREVER } from "@/domain/types";

const row = <T,>(r: unknown) => JSON.parse((r as { json: string }).json) as T;
// node:sqlite rows have a null prototype; React Server Components refuse to serialize those.
const plain = <T,>(r: unknown) => ({ ...(r as object) }) as T;

export function loadFacility(): Facility {
  const d = db();
  const workers = d.prepare("SELECT json FROM workers").all().map((r) => row<Worker>(r));
  const shifts = d.prepare("SELECT json FROM shifts").all().map((r) => row<ShiftTemplate>(r));
  const policyRow = d.prepare("SELECT json FROM policy WHERE id = 1").get();
  const rules = d.prepare("SELECT json FROM rules").all().map((r) => row<Rule>(r));
  const pto = d.prepare("SELECT id, worker_id as workerId, start, end FROM pto").all().map((r) => plain<Pto>(r));
  return { workers, shifts, rules, pto, policy: policyRow ? row(policyRow) : { maxOtShiftsPerWeek: 1, otOnlyShift: "OVN", turnaroundPenalty: { EVENING_to_AM: 3, OVN_to_AM: 6 } } };
}

export function activeRules(asOf?: string): Rule[] {
  const d = db();
  const date = asOf ?? new Date().toISOString().slice(0, 10);
  return d.prepare("SELECT json FROM rules WHERE effective_from <= ? AND effective_to >= ?").all(date, date).map((r) => row<Rule>(r));
}

export function insertRule(r: Rule) {
  db().prepare("INSERT INTO rules (id,key,worker_id,supersedes,effective_from,effective_to,json,created_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(r.id, r.key, r.workerId, r.supersedes, r.effective.from, r.effective.to, JSON.stringify(r), r.createdAt);
}

/** The only mutation a rule row ever receives: closing its effectivity window. */
export function closeRule(id: string, to: string) {
  const d = db();
  const r = row<Rule>(d.prepare("SELECT json FROM rules WHERE id = ?").get(id));
  r.effective.to = to;
  d.prepare("UPDATE rules SET effective_to = ?, json = ? WHERE id = ?").run(to, JSON.stringify(r), id);
}

export function listSchedules(): Schedule[] {
  return db().prepare("SELECT id, start_date as startDate, days, status FROM schedules ORDER BY start_date DESC").all().map((r) => plain<Schedule>(r));
}
export function getSchedule(id: string): Schedule | undefined {
  const r = db().prepare("SELECT id, start_date as startDate, days, status FROM schedules WHERE id = ?").get(id);
  return r ? plain<Schedule>(r) : undefined;
}
export function createSchedule(startDate: string, days = 14): Schedule {
  const s: Schedule = { id: uid("sch"), startDate, days, status: "draft" };
  db().prepare("INSERT INTO schedules (id,start_date,days,status,created_at) VALUES (?,?,?,?,?)").run(s.id, s.startDate, s.days, s.status, new Date().toISOString());
  return s;
}
export function setScheduleStatus(id: string, status: Schedule["status"]) {
  db().prepare("UPDATE schedules SET status = ? WHERE id = ?").run(status, id);
}
export function listAssignments(scheduleId: string): Assignment[] {
  return db().prepare("SELECT json FROM assignments WHERE schedule_id = ?").all(scheduleId).map((r) => row<Assignment>(r));
}
export function addAssignment(a: Omit<Assignment, "id">): Assignment {
  const full: Assignment = { ...a, id: uid("asg") };
  db().prepare("INSERT INTO assignments (id,schedule_id,date,shift_id,worker_id,json) VALUES (?,?,?,?,?,?)")
    .run(full.id, full.scheduleId, full.date, full.shiftId, full.workerId, JSON.stringify(full));
  return full;
}
export function removeAssignment(id: string) {
  db().prepare("DELETE FROM assignments WHERE id = ?").run(id);
}
export function replacePto(pto: Omit<Pto, "id">[]) {
  const d = db();
  d.exec("DELETE FROM pto");
  const ins = d.prepare("INSERT INTO pto (id,worker_id,start,end) VALUES (?,?,?,?)");
  for (const p of pto) ins.run(uid("pto"), p.workerId, p.start, p.end);
}
export function upsertFacility(f: { workers: Worker[]; shifts: ShiftTemplate[]; policy: Facility["policy"] }) {
  const d = db();
  const w = d.prepare("INSERT OR REPLACE INTO workers (id,json) VALUES (?,?)");
  for (const x of f.workers) w.run(x.id, JSON.stringify(x));
  const s = d.prepare("INSERT OR REPLACE INTO shifts (id,json) VALUES (?,?)");
  for (const x of f.shifts) s.run(x.id, JSON.stringify(x));
  d.prepare("INSERT OR REPLACE INTO policy (id,json) VALUES (1,?)").run(JSON.stringify(f.policy));
}
export function deleteSchedule(id: string) {
  db().prepare("DELETE FROM schedules WHERE id = ?").run(id);
}
export function clearAssignments(scheduleId: string) {
  db().prepare("DELETE FROM assignments WHERE schedule_id = ?").run(scheduleId);
}
export { FOREVER, uid };
