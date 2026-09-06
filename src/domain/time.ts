import type { ISODate, Interval, Rule, Weekday, Pto, Worker } from "./types";

export function dayOfWeek(iso: ISODate): Weekday {
  return new Date(iso + "T00:00:00").getDay() as Weekday;
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dateRange(start: ISODate, days: number): ISODate[] {
  return Array.from({ length: days }, (_, i) => addDays(start, i));
}

/** Monday of the week containing iso (weeks run Mon–Sun). */
export function weekStart(iso: ISODate): ISODate {
  const dow = dayOfWeek(iso);
  return addDays(iso, -((dow + 6) % 7));
}

export function weeksOf(start: ISODate, days: number): ISODate[][] {
  const all = dateRange(start, days);
  const out: ISODate[][] = [];
  for (let i = 0; i < all.length; i += 7) out.push(all.slice(i, i + 7));
  return out;
}

/** The one question the time model must answer cleanly. */
export function inEffect(rule: Pick<Rule, "effective">, date: ISODate): boolean {
  return rule.effective.from <= date && date <= rule.effective.to;
}

export function isOnPto(pto: Pto[], workerId: string, date: ISODate): boolean {
  return pto.some((p) => p.workerId === workerId && p.start <= date && date <= p.end);
}

export function ptoDaysInWeek(pto: Pto[], workerId: string, weekDates: ISODate[]): number {
  return weekDates.filter((d) => isOnPto(pto, workerId, d)).length;
}

/** 5×8 soft objective, lowered by PTO. Never below zero. */
export function adjustedTarget(worker: Worker, pto: Pto[], weekDates: ISODate[]): number {
  const perDay = worker.targetHoursPerWeek / 5;
  const off = ptoDaysInWeek(pto, worker.id, weekDates);
  return Math.max(0, worker.targetHoursPerWeek - Math.min(5, off) * perDay);
}

export function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function intervalHours(iv: Interval): number {
  let s = minutes(iv.start);
  let e = minutes(iv.end);
  if (e <= s) e += 24 * 60;
  return (e - s) / 60;
}

export function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "p" : "a";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")}${suffix}` : `${h12}${suffix}`;
}

export function fmtInterval(iv: Interval): string {
  return `${fmtTime(iv.start)}–${fmtTime(iv.end)}`;
}

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_LONG = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
