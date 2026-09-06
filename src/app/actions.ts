"use server";
import { revalidatePath } from "next/cache";
import { loadFacility, getSchedule, listAssignments, addAssignment, removeAssignment, createSchedule, setScheduleStatus, deleteSchedule as dbDeleteSchedule, clearAssignments } from "@/db/repo";
import { rankForSlot, workedInterval } from "@/domain/rank";
import { slotsFor } from "@/domain/validate";
import type { ISODate, ShiftId } from "@/domain/types";
import { weekStart, addDays } from "@/domain/time";
import { redirect } from "next/navigation";

export async function rankSlot(scheduleId: string, date: ISODate, shiftId: ShiftId) {
  const f = loadFacility();
  const s = getSchedule(scheduleId);
  if (!s) throw new Error("schedule not found");
  return rankForSlot(f, s, listAssignments(scheduleId), date, shiftId).map((c) => ({
    workerId: c.worker.id, name: c.worker.name, color: c.worker.color, role: c.worker.role,
    eligible: c.eligible, mode: c.mode, score: Math.round(c.score * 10) / 10,
    hours: c.hoursThisWeek, target: c.targetThisWeek, interval: c.assignment.interval, shiftHours: c.assignment.hours,
    hard: c.hard.map((v) => ({ message: v.message, quote: v.quote, cost: v.cost, overridableBy: v.overridableBy })),
    soft: c.soft.map((v) => ({ message: v.message, quote: v.quote, cost: v.cost, weight: v.weight })),
    resolves: c.resolves.map((v) => v.message),
  }));
}

export async function assign(scheduleId: string, date: ISODate, shiftId: ShiftId, workerId: string, mode: "regular" | "ot" | "fallback", overrideReason?: string) {
  const f = loadFacility();
  const w = f.workers.find((x) => x.id === workerId);
  if (!w) throw new Error("worker not found");
  const { interval, hours } = workedInterval(f, w, date, shiftId);
  addAssignment({ scheduleId, date, shiftId, workerId, interval, hours, ot: mode === "ot", fallback: mode === "fallback", overrideReason });
  revalidatePath("/");
}

export async function unassign(id: string) {
  removeAssignment(id);
  revalidatePath("/");
}

export async function newSchedule(startDate: ISODate) {
  const s = createSchedule(startDate, 14);
  revalidatePath("/");
  return s.id;
}

export async function publish(scheduleId: string) {
  setScheduleStatus(scheduleId, "published");
  revalidatePath("/");
}

export async function createFromForm(formData: FormData) {
  const raw = String(formData.get("start") || "");
  const start = raw ? weekStart(raw) : weekStart(addDays(new Date().toISOString().slice(0, 10), 7));
  const s = createSchedule(start, 14);
  redirect(`/?s=${s.id}`);
}

export async function autofill(scheduleId: string) {
  const f = loadFacility();
  const s = getSchedule(scheduleId);
  if (!s) throw new Error("schedule not found");
  const slots = slotsFor(f, s).filter((x) => x.demand > 0).sort((a, b) => a.date.localeCompare(b.date));
  let filled = 0;
  for (const slot of slots) {
    for (let i = 0; i < slot.demand; i++) {
      const cur = listAssignments(s.id);
      const already = cur.filter((a) => a.date === slot.date && a.shiftId === slot.shiftId).length;
      if (already > i) continue; // slot position already filled
      const top = rankForSlot(f, s, cur, slot.date, slot.shiftId).find((c) => c.eligible && c.mode === "regular");
      if (!top) break;
      const { id: _drop, ...a } = top.assignment; void _drop;
      addAssignment(a);
      filled++;
    }
  }
  revalidatePath("/");
  return filled;
}

export async function removeSchedule(scheduleId: string) {
  dbDeleteSchedule(scheduleId);
  revalidatePath("/");
  redirect("/");
}

export async function clearSchedule(scheduleId: string) {
  clearAssignments(scheduleId);
  revalidatePath("/");
}
