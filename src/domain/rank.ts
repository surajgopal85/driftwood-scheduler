import type { Assignment, Facility, ISODate, Schedule, ShiftId, Violation, Worker } from "./types";
import { validate } from "./validate";
import { adjustedTarget, inEffect, intervalHours, isOnPto, dayOfWeek, weeksOf } from "./time";

export interface Candidate {
  worker: Worker;
  assignment: Assignment; // what would be added
  eligible: boolean; // no new hard violations
  hard: Violation[]; // new hard violations this would create
  soft: Violation[]; // new soft violations this would create
  resolves: Violation[]; // existing violations this would fix (e.g. coverage gap, require)
  score: number; // lower is better
  hoursThisWeek: number;
  targetThisWeek: number;
  mode: "regular" | "ot" | "fallback";
}

/** The interval a worker actually works when placed in this slot. */
export function workedInterval(f: Facility, w: Worker, date: ISODate, shiftId: ShiftId) {
  const tpl = f.shifts.find((s) => s.id === shiftId)!;
  const withInterval = f.rules.find(
    (r) => r.workerId === w.id && r.scope.interval && inEffect(r, date) &&
      (!r.scope.days || r.scope.days.includes(dayOfWeek(date))) &&
      (!r.scope.shifts || r.scope.shifts.includes(shiftId)),
  );
  const interval = withInterval?.scope.interval ?? tpl.interval;
  return { interval, hours: intervalHours(interval) };
}

const sig = (v: Violation) => `${v.code}|${v.workerId ?? ""}|${v.date ?? ""}|${v.shiftId ?? ""}|${v.ruleId ?? ""}|${v.message}`;

export function rankForSlot(
  f: Facility, s: Schedule, existing: Assignment[], date: ISODate, shiftId: ShiftId,
): Candidate[] {
  const baseline = validate(f, s, existing);
  const baseSigs = new Set(baseline.map(sig));
  const week = weeksOf(s.startDate, s.days).find((w) => w.includes(date)) ?? [date];
  const out: Candidate[] = [];

  for (const w of f.workers) {
    if (!w.active) continue;
    const alreadyThere = existing.some((a) => a.workerId === w.id && a.date === date && a.shiftId === shiftId);
    if (alreadyThere) continue;
    const sameDay = existing.filter((a) => a.workerId === w.id && a.date === date);

    let mode: Candidate["mode"] = "regular";
    if (w.role === "manager") mode = "fallback";
    else if (sameDay.length > 0) {
      if (!w.otEligible) continue;
      mode = "ot";
    }

    const { interval, hours } = workedInterval(f, w, date, shiftId);
    const assignment: Assignment = {
      id: `cand_${w.id}_${date}_${shiftId}`,
      scheduleId: s.id, date, shiftId, workerId: w.id, interval, hours,
      ot: mode === "ot", fallback: mode === "fallback",
    };

    const after = validate(f, s, [...existing, assignment]);
    const afterSigs = new Set(after.map(sig));
    const added = after.filter((x) => !baseSigs.has(sig(x)) && x.code !== "HOURS_UNDER" && x.code !== "COVERAGE_GAP" && (x.workerId === w.id || (x.date === date && x.shiftId === shiftId)));
    const resolves = baseline.filter((x) => !afterSigs.has(sig(x)));
    const hard = added.filter((x) => x.severity === "hard");
    const soft = added.filter((x) => x.severity === "soft");

    const hoursThisWeek = existing.filter((a) => a.workerId === w.id && week.includes(a.date) && !a.ot).reduce((n, a) => n + a.hours, 0);
    const targetThisWeek = w.role === "staff" ? adjustedTarget(w, f.pto, week) : 0;
    const deficit = Math.max(0, targetThisWeek - hoursThisWeek);

    const modePenalty = mode === "ot" ? 15 : mode === "fallback" ? 30 + (w.fallback?.priority ?? 9) * 5 : 0;
    // Deficit as a fraction of target (0..10) so part-timers aren't starved by 40h people.
    const deficitScore = targetThisWeek > 0 ? (deficit / targetThisWeek) * 10 : 0;
    // Specialist fit: this slot is one of the few things the worker is restricted to.
    const fit = f.rules.some((r) => r.workerId === w.id && r.kind === "restrict" && r.bindingness === "hard" &&
      inEffect(r, date) && r.scope.shifts?.includes(shiftId) && (!r.scope.days || r.scope.days.includes(dayOfWeek(date)))) ? -3 : 0;
    const score = hard.length * 1000 + soft.reduce((n, x) => n + x.weight, 0) - deficitScore + fit + modePenalty
      - resolves.filter((x) => x.code !== "COVERAGE_GAP" && x.code !== "HOURS_UNDER").reduce((n, x) => n + x.weight, 0);

    out.push({ worker: w, assignment, eligible: hard.length === 0, hard, soft, resolves, score, hoursThisWeek, targetThisWeek, mode });
  }

  return out.sort((a, b) => a.score - b.score);
}

/** Quick eligibility used by the board to grey out impossible cells. */
export function isBlocked(f: Facility, w: Worker, date: ISODate): boolean {
  return !w.active || isOnPto(f.pto, w.id, date);
}
