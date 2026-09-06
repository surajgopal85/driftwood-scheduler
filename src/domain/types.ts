// Domain model for the Riverside scheduler.
// Design decisions encoded here (see docs/DESIGN.md):
//   1. A rule has three orthogonal axes: bindingness (filter vs penalty),
//      cost (what breaking it means, for explanations), overridableBy (who may).
//      `weight` is a numeric tiebreak derived from cost unless set explicitly.
//   2. Recurrence (scope.days) is separate from effectivity (effective.from/to).
//      `to` is required; use FOREVER, never null.
//   3. Rules are immutable. Edits create a new rule with `supersedes`.
//   4. A Slot is a container (date × shift template). An Assignment carries its
//      own worked interval and hours inside a slot.

export type ISODate = string; // YYYY-MM-DD
export type HHMM = string; // 24h "07:00"
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // JS getDay(): 0 = Sunday
export type ShiftId = "AM" | "MID" | "EVENING" | "OVN";

export const FOREVER: ISODate = "9999-12-31";

export interface Interval {
  start: HHMM;
  end: HHMM; // may be < start when crossing midnight (OVN)
}

export interface ShiftTemplate {
  id: ShiftId;
  label: string;
  interval: Interval;
  hours: number;
  /** demand per weekday: [Sun..Sat] -> min bodies */
  demand: number[];
  /** soft ceiling per weekday */
  capacity: number[];
}

export interface Worker {
  id: string;
  name: string;
  aliases: string[]; // spellings seen in Gordon's sheets
  role: "staff" | "manager";
  targetHoursPerWeek: number; // soft objective; PTO lowers it
  otEligible: boolean;
  active: boolean;
  fallback?: {
    maxShiftsPerWeek: number;
    shifts: ShiftId[];
    priority: number; // 1 = asked first
  };
  color: string;
}

export type RuleKind = "forbid" | "restrict" | "require" | "pattern";
export type Bindingness = "hard" | "soft";
export type Cost = "annoyance" | "morale" | "contractual" | "regulatory";
export type Authority = "gordon" | "director" | "none";

export const DEFAULT_WEIGHT: Record<Cost, number> = {
  annoyance: 1,
  morale: 3,
  contractual: 8,
  regulatory: 20,
};

export interface RuleScope {
  days?: Weekday[];
  shifts?: ShiftId[];
  /** worked interval when this worker takes a matching slot (e.g. Nick 09:00–21:00) */
  interval?: Interval;
}

export interface RulePattern {
  maxConsecutiveDays?: number;
  minConsecutiveDaysOff?: number;
  weekendDaysOff?: number; // at least N of Sat/Sun off per week
  maxDaysPerWeek?: number;
}

export interface Rule {
  id: string;
  key: string; // stable human key, e.g. "beth.am-only" — used by rules:apply diff
  workerId: string | null; // null = facility policy
  supersedes: string | null;
  kind: RuleKind;
  scope: RuleScope;
  pattern?: RulePattern;
  bindingness: Bindingness;
  cost: Cost;
  overridableBy: Authority;
  weight: number;
  effective: { from: ISODate; to: ISODate };
  source: { text: string; quote?: string; confidence?: number };
  createdAt: string;
}

export interface Pto {
  id: string;
  workerId: string;
  start: ISODate;
  end: ISODate; // inclusive
}

export interface Schedule {
  id: string;
  startDate: ISODate; // a Monday
  days: number; // 14
  status: "draft" | "published";
}

export interface Assignment {
  id: string;
  scheduleId: string;
  date: ISODate;
  shiftId: ShiftId;
  workerId: string;
  interval: Interval; // actual worked interval, defaults to template
  hours: number;
  ot: boolean;
  fallback: boolean;
  overrideReason?: string;
}

export interface Slot {
  date: ISODate;
  shiftId: ShiftId;
  demand: number;
  capacity: number;
}

export type Severity = "hard" | "soft";

export interface Violation {
  code:
    | "PTO"
    | "RULE_FORBID"
    | "RULE_RESTRICT"
    | "RULE_REQUIRE"
    | "PATTERN"
    | "DOUBLE_BOOKED"
    | "TURNAROUND"
    | "OT_LIMIT"
    | "HOURS_OVER"
    | "HOURS_UNDER"
    | "COVERAGE_GAP"
    | "COVERAGE_OVER"
    | "FALLBACK_CAP"
    | "MANAGER_AUTO"
    | "INACTIVE";
  severity: Severity;
  cost: Cost;
  weight: number;
  overridableBy: Authority;
  message: string;
  workerId?: string;
  date?: ISODate;
  shiftId?: ShiftId;
  ruleId?: string;
  quote?: string;
}

export interface Facility {
  shifts: ShiftTemplate[];
  workers: Worker[];
  rules: Rule[];
  pto: Pto[];
  policy: {
    maxOtShiftsPerWeek: number; // 1
    otOnlyShift: ShiftId | null; // OVN
    turnaroundPenalty: { EVENING_to_AM: number; OVN_to_AM: number };
  };
}
