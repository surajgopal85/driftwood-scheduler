import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import type { Assignment, Facility, Schedule } from "../src/domain/types";
import { validate } from "../src/domain/validate";
import { rankForSlot, workedInterval } from "../src/domain/rank";
import { inEffect, adjustedTarget, weeksOf } from "../src/domain/time";
import { readRuleFile, materialize } from "../scripts/_load";

const base = JSON.parse(fs.readFileSync("data/facility.json", "utf8"));
const rf1 = readRuleFile("rules/v0.1.json");
const rf2 = fs.existsSync("rules/v0.2.json") ? readRuleFile("rules/v0.2.json") : { rules: [], effectiveFrom: "" };
const rules = [
  ...rf1.rules.map((e, i) => materialize(e, `r1_${i}`, rf1.effectiveFrom, null)),
  ...rf2.rules.map((e, i) => materialize(e, `r2_${i}`, rf2.effectiveFrom, null)),
];
const f: Facility = { ...base, rules, pto: [] };
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

test("Kate H: no PM Tuesday is hard; EVENING elsewhere is only soft", () => {
  const tue = validate(f, s, [asg("kate-h", "2026-09-15", "EVENING")]);
  assert.ok(codes(tue, "kate-h").includes("RULE_FORBID"));
  assert.ok(tue.find((v) => v.code === "RULE_FORBID")!.quote?.includes("No PM Tuesday"));
  const wed = validate(f, s, [asg("kate-h", "2026-09-16", "EVENING")]);
  const kh = wed.filter((v) => v.workerId === "kate-h" && v.code !== "HOURS_UNDER");
  assert.deepEqual(kh.map((v) => v.severity), ["soft"]);
});

test("restrict with days+shifts leaves other days unaffected (Robin)", () => {
  const ok = validate(f, s, [asg("robin", "2026-09-15", "MID")]); // Tuesday MID
  assert.ok(!codes(ok, "robin").includes("RULE_RESTRICT"));
  const bad = validate(f, s, [asg("robin", "2026-09-15", "AM")]); // Tuesday AM
  assert.ok(codes(bad, "robin").includes("RULE_RESTRICT"));
  const thu = validate(f, s, [asg("robin", "2026-09-17", "AM")]); // Thursday: not her day
  assert.ok(codes(thu, "robin").includes("RULE_RESTRICT"));
});

test("PTO lowers the hours target instead of being routed around", () => {
  const week = weeksOf(s.startDate, 7)[0];
  const beth = f.workers.find((w) => w.id === "beth")!;
  assert.equal(adjustedTarget(beth, [], week), 40);
  assert.equal(adjustedTarget(beth, [{ id: "p", workerId: "beth", start: "2026-09-15", end: "2026-09-16" }], week), 24);
});

test("effectivity window answers 'was this rule live on date X'", () => {
  const r = { effective: { from: "2026-03-01", to: "2026-11-30" } };
  assert.equal(inEffect(r, "2026-02-28"), false);
  assert.equal(inEffect(r, "2026-03-01"), true);
  assert.equal(inEffect(r, "2026-11-30"), true);
  assert.equal(inEffect(r, "2026-12-01"), false);
});

test("worked interval comes from the rule, not the slot (Nick 9–9, David 10p–8a)", () => {
  const nick = f.workers.find((w) => w.id === "nick")!;
  assert.deepEqual(workedInterval(f, nick, "2026-09-19", "AM"), { interval: { start: "09:00", end: "21:00" }, hours: 12 });
  assert.equal(workedInterval(f, nick, "2026-09-16", "AM").hours, 6); // Wednesday is his 6h day
  const david = f.workers.find((w) => w.id === "david")!;
  assert.equal(workedInterval(f, david, "2026-09-14", "OVN").hours, 10);
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

test("Michelle: six in a row is hard, split days off is soft", () => {
  const six = ["14", "15", "16", "17", "18", "19"].map((d) => asg("michelle", `2026-09-${d}`, "AM"));
  const vs = validate(f, s, six);
  const pat = vs.filter((v) => v.workerId === "michelle" && v.code === "PATTERN");
  assert.ok(pat.some((v) => v.severity === "hard" && v.message.includes("more than 5")));
});

test("manager fallback cap: Kacy 4, Gordon 1", () => {
  const g = [asg("gordon", "2026-09-14", "AM", { fallback: true }), asg("gordon", "2026-09-15", "AM", { fallback: true })];
  assert.ok(codes(validate(f, s, g), "gordon").includes("FALLBACK_CAP"));
  const k = ["14", "15", "16", "17"].map((d) => asg("kacy", `2026-09-${d}`, "AM", { fallback: true }));
  assert.ok(!codes(validate(f, s, k), "kacy").includes("FALLBACK_CAP"));
});

test("rank: Tuesday OVN puts Zach/David first, managers last, gives reasons", () => {
  const ranked = rankForSlot(f, s, [], "2026-09-15", "OVN");
  const eligible = ranked.filter((c) => c.eligible).map((c) => c.worker.id);
  assert.ok(eligible.slice(0, 2).includes("zach-w") && eligible.slice(0, 2).includes("david"));
  const beth = ranked.find((c) => c.worker.id === "beth")!;
  assert.equal(beth.eligible, false);
  assert.ok(beth.hard[0].quote?.includes("AM only"));
  assert.ok(ranked.findIndex((c) => c.worker.id === "kacy") > eligible.length - 2);
  assert.ok(ranked[0].resolves.some((v) => v.code === "COVERAGE_GAP"));
});
