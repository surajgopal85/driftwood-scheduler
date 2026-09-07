import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import type { Assignment, Facility, Schedule } from "../src/domain/types";
import { validate } from "../src/domain/validate";
import { rankForSlot, workedInterval } from "../src/domain/rank";
import { inEffect, adjustedTarget, weeksOf } from "../src/domain/time";
import { readRuleFile, materialize } from "../scripts/_load";

const base = JSON.parse(fs.readFileSync("data/facility.json", "utf8"));
const allRules: ReturnType<typeof materialize>[] = [];
for (const path of ["rules/v0.1.json", "rules/v0.2.json", "rules/v0.3.json"]) {
  if (!fs.existsSync(path)) continue;
  const rf = readRuleFile(path);
  allRules.push(...rf.rules.map((e, i) => materialize(e, `${path}_${i}`, rf.effectiveFrom, null)));
}
const f: Facility = { ...base, rules: allRules, pto: [] };
const s: Schedule = { id: "t", startDate: "2026-09-14", days: 14, status: "draft" }; // a Monday
const tpl = (id: string) => f.shifts.find((x) => x.id === id)!;
const asg = (workerId: string, date: string, shiftId: Assignment["shiftId"], extra: Partial<Assignment> = {}): Assignment => ({
  id: `${workerId}-${date}-${shiftId}`, scheduleId: "t", date, shiftId, workerId,
  interval: tpl(shiftId).interval, hours: tpl(shiftId).hours, ot: false, fallback: false, ...extra,
});
const codes = (vs: ReturnType<typeof validate>, workerId?: string) =>
  vs.filter((v) => !workerId || v.workerId === workerId).map((v) => v.code);

test("empty schedule: every demanded slot is a coverage gap", () => {
  const gaps = validate(f, s, []).filter((v) => v.code === "COVERAGE_GAP");
  assert.equal(gaps.length, 14 * 3); // AM(2), EVENING(2), OVN(1) demanded; MID is 0
});

test("Charlie: no PM on Monday is hard", () => {
  const mon = validate(f, s, [asg("charlie", "2026-09-14", "EVENING")]);
  assert.ok(codes(mon, "charlie").includes("RULE_FORBID"));
  assert.ok(mon.find((v) => v.code === "RULE_FORBID" && v.workerId === "charlie")!.quote?.includes("No PM Shifts on Mondays"));
});

test("Charlie: no shifts Tue/Thu during school (Aug-Dec)", () => {
  const tue = validate(f, s, [asg("charlie", "2026-09-15", "AM")]); // Tuesday in school period
  assert.ok(codes(tue, "charlie").includes("RULE_FORBID"));
});

test("Alex: no Saturdays is hard, no OVN is hard", () => {
  const sat = validate(f, s, [asg("alex", "2026-09-19", "AM")]); // Saturday
  assert.ok(codes(sat, "alex").includes("RULE_FORBID"));
  const ovn = validate(f, s, [asg("alex", "2026-09-14", "OVN")]); // Monday OVN
  assert.ok(codes(ovn, "alex").includes("RULE_FORBID"));
  const ok = validate(f, s, [asg("alex", "2026-09-14", "AM")]); // Monday AM — fine
  assert.ok(!codes(ok, "alex").includes("RULE_FORBID"));
});

test("PTO lowers the hours target", () => {
  const week = weeksOf(s.startDate, 7)[0];
  const steph = f.workers.find((w) => w.id === "steph")!;
  assert.equal(adjustedTarget(steph, [], week), 40);
  assert.equal(adjustedTarget(steph, [{ id: "p", workerId: "steph", start: "2026-09-15", end: "2026-09-16" }], week), 24);
});

test("effectivity window answers 'was this rule live on date X'", () => {
  const r = { effective: { from: "2026-03-01", to: "2026-11-30" } };
  assert.equal(inEffect(r, "2026-02-28"), false);
  assert.equal(inEffect(r, "2026-03-01"), true);
  assert.equal(inEffect(r, "2026-11-30"), true);
  assert.equal(inEffect(r, "2026-12-01"), false);
});

test("worked interval comes from the rule, not the slot (Nick 9-9, David 10p-8a)", () => {
  const nick = f.workers.find((w) => w.id === "nick")!;
  assert.deepEqual(workedInterval(f, nick, "2026-09-19", "AM"), { interval: { start: "09:00", end: "21:00" }, hours: 12 });
  assert.equal(workedInterval(f, nick, "2026-09-16", "AM").hours, 6); // Wednesday is his 6h day
  const david = f.workers.find((w) => w.id === "david")!;
  assert.equal(workedInterval(f, david, "2026-09-17", "OVN").hours, 10); // Thursday
});

test("OT: a second shift the same day needs the flag, is OVN-only, max one per week", () => {
  const a = asg("steph", "2026-09-14", "EVENING");
  const b = asg("steph", "2026-09-14", "OVN");
  assert.ok(codes(validate(f, s, [a, b]), "steph").includes("DOUBLE_BOOKED"));
  const flagged = validate(f, s, [a, { ...b, ot: true }]);
  assert.ok(!codes(flagged, "steph").includes("DOUBLE_BOOKED"));
  assert.ok(!codes(flagged, "steph").includes("OT_LIMIT"));
  const two = validate(f, s, [a, { ...b, ot: true }, asg("steph", "2026-09-16", "OVN", { ot: true })]);
  assert.ok(codes(two, "steph").includes("OT_LIMIT"));
});

test("Maddi: OVN only, Mon-Wed only", () => {
  const ok = validate(f, s, [asg("maddi", "2026-09-14", "OVN")]); // Monday OVN
  assert.ok(!codes(ok, "maddi").includes("RULE_RESTRICT"));
  const badShift = validate(f, s, [asg("maddi", "2026-09-14", "AM")]); // Monday AM
  assert.ok(codes(badShift, "maddi").includes("RULE_RESTRICT"));
  const badDay = validate(f, s, [asg("maddi", "2026-09-17", "OVN")]); // Thursday OVN
  assert.ok(codes(badDay, "maddi").includes("RULE_RESTRICT"));
});

test("manager fallback cap: Kacy 4, Gordon 1", () => {
  const g = [asg("gordon", "2026-09-14", "AM", { fallback: true }), asg("gordon", "2026-09-15", "AM", { fallback: true })];
  assert.ok(codes(validate(f, s, g), "gordon").includes("FALLBACK_CAP"));
  const k = ["14", "15", "16", "17"].map((d) => asg("kacy", `2026-09-${d}`, "AM", { fallback: true }));
  assert.ok(!codes(validate(f, s, k), "kacy").includes("FALLBACK_CAP"));
});

test("rank: Thursday OVN puts David first, managers last", () => {
  const ranked = rankForSlot(f, s, [], "2026-09-17", "OVN"); // Thursday
  const eligible = ranked.filter((c) => c.eligible);
  assert.ok(eligible[0].worker.id === "david");
  assert.ok(ranked[0].resolves.some((v) => v.code === "COVERAGE_GAP"));
});
