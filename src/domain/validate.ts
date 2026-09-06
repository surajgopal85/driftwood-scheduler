import type {
  Assignment, Facility, ISODate, Rule, Schedule, ShiftId, Slot, Violation, Weekday, Worker,
} from "./types";
import { DEFAULT_WEIGHT } from "./types";
import {
  adjustedTarget, dateRange, dayOfWeek, inEffect, isOnPto, weeksOf, WEEKDAY_LONG, addDays,
} from "./time";

export function slotsFor(f: Facility, s: Schedule): Slot[] {
  const out: Slot[] = [];
  for (const date of dateRange(s.startDate, s.days)) {
    const dow = dayOfWeek(date);
    for (const t of f.shifts) {
      out.push({ date, shiftId: t.id, demand: t.demand[dow], capacity: t.capacity[dow] });
    }
  }
  return out;
}

/** Does this rule's recurrence scope apply to (date, shift)? Ignores effectivity. */
export function scopeMatches(rule: Rule, date: ISODate, shiftId: ShiftId): boolean {
  const dow = dayOfWeek(date);
  const { days, shifts } = rule.scope;
  const dayOk = !days || days.includes(dow);
  const shiftOk = !shifts || shifts.includes(shiftId);
  return dayOk && shiftOk;
}

/** For a `restrict` rule: is (date, shift) permitted? */
export function restrictAllows(rule: Rule, date: ISODate, shiftId: ShiftId): boolean {
  const dow = dayOfWeek(date);
  const { days, shifts } = rule.scope;
  if (days && shifts) {
    // "on these days, only these shifts" — other days unaffected
    return !days.includes(dow) || shifts.includes(shiftId);
  }
  if (days) return days.includes(dow);
  if (shifts) return shifts.includes(shiftId);
  return true;
}

function fromRule(rule: Rule, code: Violation["code"], message: string, extra: Partial<Violation>): Violation {
  return {
    code,
    severity: rule.bindingness,
    cost: rule.cost,
    weight: rule.weight,
    overridableBy: rule.overridableBy,
    message,
    ruleId: rule.id,
    quote: rule.source.quote ?? rule.source.text,
    ...extra,
  };
}

function shiftLabel(f: Facility, id: ShiftId) {
  return f.shifts.find((s) => s.id === id)?.label ?? id;
}

const WEEKEND: Weekday[] = [0, 6];

/**
 * Validate a full schedule. Pure: no I/O.
 * Returns every violation, hard and soft, each self-explaining.
 */
export function validate(f: Facility, s: Schedule, assignments: Assignment[]): Violation[] {
  const v: Violation[] = [];
  const workers = new Map(f.workers.map((w) => [w.id, w]));
  const byWorkerDate = new Map<string, Assignment[]>();
  const bySlot = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const k1 = `${a.workerId}|${a.date}`;
    byWorkerDate.set(k1, [...(byWorkerDate.get(k1) ?? []), a]);
    const k2 = `${a.date}|${a.shiftId}`;
    bySlot.set(k2, [...(bySlot.get(k2) ?? []), a]);
  }
  const name = (id: string) => workers.get(id)?.name ?? id;

  // --- per-assignment checks ---
  for (const a of assignments) {
    const w = workers.get(a.workerId);
    if (!w) continue;
    const label = shiftLabel(f, a.shiftId);
    const when = `${WEEKDAY_LONG[dayOfWeek(a.date)]} ${a.date.slice(5)} ${label}`;

    if (!w.active) {
      v.push({ code: "INACTIVE", severity: "hard", cost: "contractual", weight: 8, overridableBy: "gordon",
        message: `${w.name} is marked inactive for scheduling`, workerId: w.id, date: a.date, shiftId: a.shiftId });
    }
    if (isOnPto(f.pto, w.id, a.date)) {
      v.push({ code: "PTO", severity: "hard", cost: "contractual", weight: 20, overridableBy: "none",
        message: `${w.name} is on PTO on ${a.date.slice(5)}`, workerId: w.id, date: a.date, shiftId: a.shiftId });
    }
    if (w.role === "manager" && !a.fallback) {
      v.push({ code: "MANAGER_AUTO", severity: "soft", cost: "morale", weight: 3, overridableBy: "gordon",
        message: `${w.name} is a manager; mark this as fallback coverage`, workerId: w.id, date: a.date, shiftId: a.shiftId });
    }

    for (const r of f.rules) {
      if (r.workerId !== w.id || !inEffect(r, a.date)) continue;
      if (r.kind === "forbid" && scopeMatches(r, a.date, a.shiftId)) {
        v.push(fromRule(r, "RULE_FORBID", `${w.name} can't take ${when}`, { workerId: w.id, date: a.date, shiftId: a.shiftId }));
      }
      if (r.kind === "restrict" && !restrictAllows(r, a.date, a.shiftId)) {
        v.push(fromRule(r, "RULE_RESTRICT", `${when} is outside ${w.name}'s allowed days/shifts`, { workerId: w.id, date: a.date, shiftId: a.shiftId }));
      }
    }
  }

  // --- double booking + turnaround ---
  for (const [key, list] of byWorkerDate) {
    const [workerId, date] = key.split("|");
    if (list.length > 1 && !list.some((a) => a.ot)) {
      v.push({ code: "DOUBLE_BOOKED", severity: "hard", cost: "regulatory", weight: 20, overridableBy: "director",
        message: `${name(workerId)} has ${list.length} shifts on ${date.slice(5)} without an OT flag`, workerId, date });
    }
  }
  for (const a of assignments) {
    if (a.shiftId !== "AM") continue;
    const prev = byWorkerDate.get(`${a.workerId}|${addDays(a.date, -1)}`) ?? [];
    for (const p of prev) {
      if (p.ot || a.ot) continue;
      if (p.shiftId === "EVENING" || p.shiftId === "OVN") {
        v.push({ code: "TURNAROUND", severity: "soft", cost: "morale",
          weight: p.shiftId === "OVN" ? f.policy.turnaroundPenalty.OVN_to_AM : f.policy.turnaroundPenalty.EVENING_to_AM,
          overridableBy: "gordon",
          message: `${name(a.workerId)} works ${shiftLabel(f, p.shiftId)} then AM the next morning (${a.date.slice(5)})`,
          workerId: a.workerId, date: a.date, shiftId: "AM" });
      }
    }
  }

  // --- coverage ---
  for (const slot of slotsFor(f, s)) {
    const n = (bySlot.get(`${slot.date}|${slot.shiftId}`) ?? []).length;
    const label = `${WEEKDAY_LONG[dayOfWeek(slot.date)].slice(0, 3)} ${slot.date.slice(5)} ${shiftLabel(f, slot.shiftId)}`;
    if (n < slot.demand) {
      v.push({ code: "COVERAGE_GAP", severity: "hard", cost: "regulatory", weight: 20, overridableBy: "gordon",
        message: `${label}: ${n} of ${slot.demand} covered`, date: slot.date, shiftId: slot.shiftId });
    } else if (n > slot.capacity) {
      v.push({ code: "COVERAGE_OVER", severity: "soft", cost: "annoyance", weight: 2, overridableBy: "gordon",
        message: `${label}: ${n} scheduled, capacity ${slot.capacity}`, date: slot.date, shiftId: slot.shiftId });
    }
  }

  // --- per worker per week: hours, OT, fallback caps, require, patterns ---
  for (const week of weeksOf(s.startDate, s.days)) {
    const wkLabel = `week of ${week[0].slice(5)}`;
    for (const w of f.workers) {
      const mine = assignments.filter((a) => a.workerId === w.id && week.includes(a.date));
      const workedDates = new Set(mine.map((a) => a.date));

      if (w.role === "staff") {
        const target = adjustedTarget(w, f.pto, week);
        const regular = mine.filter((a) => !a.ot).reduce((h, a) => h + a.hours, 0);
        if (regular > target + 0.01) {
          v.push({ code: "HOURS_OVER", severity: "soft", cost: "contractual", weight: 8, overridableBy: "gordon",
            message: `${w.name}: ${regular}h regular vs ${target}h target (${wkLabel})`, workerId: w.id, date: week[0] });
        } else if (regular < target - 0.01 && w.active) {
          const deficit = target - regular;
          v.push({ code: "HOURS_UNDER", severity: "soft", cost: "annoyance", weight: Math.round((deficit / 8) * 2 * 10) / 10,
            overridableBy: "gordon",
            message: `${w.name}: ${regular}h of ${target}h target (${wkLabel})`, workerId: w.id, date: week[0] });
        }
        const otShifts = mine.filter((a) => a.ot);
        if (otShifts.length > f.policy.maxOtShiftsPerWeek) {
          v.push({ code: "OT_LIMIT", severity: "hard", cost: "regulatory", weight: 20, overridableBy: "director",
            message: `${w.name}: ${otShifts.length} OT shifts (${wkLabel}); policy allows ${f.policy.maxOtShiftsPerWeek}`, workerId: w.id, date: week[0] });
        }
        if (f.policy.otOnlyShift) {
          for (const a of otShifts) if (a.shiftId !== f.policy.otOnlyShift) {
            v.push({ code: "OT_LIMIT", severity: "hard", cost: "regulatory", weight: 20, overridableBy: "director",
              message: `${w.name}: OT on ${a.date.slice(5)} is ${shiftLabel(f, a.shiftId)}; policy allows OT only as ${f.policy.otOnlyShift}`, workerId: w.id, date: a.date, shiftId: a.shiftId });
          }
        }
        if (otShifts.length && !w.otEligible) {
          v.push({ code: "OT_LIMIT", severity: "hard", cost: "contractual", weight: 8, overridableBy: "gordon",
            message: `${w.name} is not OT-eligible (${wkLabel})`, workerId: w.id, date: week[0] });
        }
      } else if (w.fallback) {
        const fb = mine.filter((a) => a.fallback);
        if (fb.length > w.fallback.maxShiftsPerWeek) {
          v.push({ code: "FALLBACK_CAP", severity: "hard", cost: "morale", weight: 8, overridableBy: "gordon",
            message: `${w.name} covering ${fb.length} shifts (${wkLabel}); fallback cap is ${w.fallback.maxShiftsPerWeek}`, workerId: w.id, date: week[0] });
        }
        for (const a of fb) if (!w.fallback.shifts.includes(a.shiftId)) {
          v.push({ code: "FALLBACK_CAP", severity: "hard", cost: "morale", weight: 8, overridableBy: "gordon",
            message: `${w.name} only falls back into ${w.fallback.shifts.join("/")}, not ${shiftLabel(f, a.shiftId)}`, workerId: w.id, date: a.date, shiftId: a.shiftId });
        }
      }

      for (const r of f.rules) {
        if (r.workerId !== w.id) continue;
        if (r.kind === "require" && r.scope.days) {
          for (const date of week) {
            if (!inEffect(r, date) || !r.scope.days.includes(dayOfWeek(date))) continue;
            if (isOnPto(f.pto, w.id, date)) continue;
            const hit = mine.some((a) => a.date === date && (!r.scope.shifts || r.scope.shifts.includes(a.shiftId)));
            if (!hit) v.push(fromRule(r, "RULE_REQUIRE", `${w.name} is normally on ${WEEKDAY_LONG[dayOfWeek(date)]}${r.scope.shifts ? " " + r.scope.shifts.map((x) => shiftLabel(f, x)).join("/") : ""} but isn't scheduled ${date.slice(5)}`, { workerId: w.id, date }));
          }
        }
        if (r.kind === "pattern" && r.pattern && inEffect(r, week[0])) {
          const p = r.pattern;
          if (p.maxDaysPerWeek != null && workedDates.size > p.maxDaysPerWeek) {
            v.push(fromRule(r, "PATTERN", `${w.name}: ${workedDates.size} days (${wkLabel}); max ${p.maxDaysPerWeek}`, { workerId: w.id, date: week[0] }));
          }
          if (p.weekendDaysOff != null) {
            const wkndOff = week.filter((d) => WEEKEND.includes(dayOfWeek(d)) && !workedDates.has(d)).length;
            if (wkndOff < p.weekendDaysOff) {
              v.push(fromRule(r, "PATTERN", `${w.name}: no weekend day off (${wkLabel})`, { workerId: w.id, date: week[0] }));
            }
          }
        }
      }
    }
  }

  // --- patterns spanning the whole schedule: consecutive days ---
  const allDates = dateRange(s.startDate, s.days);
  for (const w of f.workers) {
    const worked = new Set(assignments.filter((a) => a.workerId === w.id).map((a) => a.date));
    for (const r of f.rules) {
      if (r.workerId !== w.id || r.kind !== "pattern" || !r.pattern) continue;
      const p = r.pattern;
      if (p.maxConsecutiveDays != null) {
        let run = 0;
        for (const d of allDates) {
          run = worked.has(d) ? run + 1 : 0;
          if (run === p.maxConsecutiveDays + 1 && inEffect(r, d)) {
            v.push(fromRule(r, "PATTERN", `${w.name} works more than ${p.maxConsecutiveDays} days in a row (through ${d.slice(5)})`, { workerId: w.id, date: d }));
          }
        }
      }
      if (p.minConsecutiveDaysOff != null) {
        // any off-stretch shorter than min, bounded by worked days on both sides
        let off = 0;
        let seenWork = false;
        for (const d of allDates) {
          if (worked.has(d)) {
            if (seenWork && off > 0 && off < p.minConsecutiveDaysOff && inEffect(r, d)) {
              v.push(fromRule(r, "PATTERN", `${w.name} gets only ${off} day off in a row before ${d.slice(5)}`, { workerId: w.id, date: d }));
            }
            off = 0; seenWork = true;
          } else off++;
        }
      }
    }
  }

  return v;
}

export function hardCount(vs: Violation[]) { return vs.filter((x) => x.severity === "hard").length; }
export function softWeight(vs: Violation[]) { return vs.filter((x) => x.severity === "soft").reduce((n, x) => n + x.weight, 0); }

export { DEFAULT_WEIGHT };
export type { Worker };
