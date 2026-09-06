"use client";
import { useState, useTransition, useMemo } from "react";
import type { Assignment, Facility, ISODate, Schedule, ShiftId, Slot, Violation } from "@/domain/types";
import { dayOfWeek, fmtInterval, WEEKDAY_SHORT } from "@/domain/time";
import { assign, unassign, rankSlot, publish, autofill, removeSchedule, clearSchedule } from "./actions";

type Cand = Awaited<ReturnType<typeof rankSlot>>[number];

interface Props {
  facility: Facility;
  schedule: Schedule;
  schedules: Schedule[];
  assignments: Assignment[];
  violations: Violation[];
  slots: Slot[];
  createAction: (fd: FormData) => Promise<void>;
}

export function Board({ facility: f, schedule: s, schedules, assignments, violations, slots, createAction }: Props) {
  const [sel, setSel] = useState<{ date: ISODate; shiftId: ShiftId } | null>(null);
  const [cands, setCands] = useState<Cand[] | null>(null);
  const [pending, start] = useTransition();
  const workers = useMemo(() => new Map(f.workers.map((w) => [w.id, w])), [f.workers]);
  const dates = useMemo(() => [...new Set(slots.map((x) => x.date))], [slots]);
  const bySlot = useMemo(() => {
    const m = new Map<string, Assignment[]>();
    for (const a of assignments) m.set(`${a.date}|${a.shiftId}`, [...(m.get(`${a.date}|${a.shiftId}`) ?? []), a]);
    return m;
  }, [assignments]);
  const violBySlot = useMemo(() => {
    const m = new Map<string, Violation[]>();
    for (const v of violations) {
      if (!v.date) continue;
      const keys = v.shiftId ? [`${v.date}|${v.shiftId}`] : assignments.filter((a) => a.workerId === v.workerId && a.date === v.date).map((a) => `${a.date}|${a.shiftId}`);
      for (const k of keys) m.set(k, [...(m.get(k) ?? []), v]);
    }
    return m;
  }, [violations, assignments]);
  const hard = violations.filter((v) => v.severity === "hard");
  const soft = violations.filter((v) => v.severity === "soft");

  function pick(date: ISODate, shiftId: ShiftId) {
    setSel({ date, shiftId });
    setCands(null);
    start(async () => setCands(await rankSlot(s.id, date, shiftId)));
  }
  function refresh() { if (sel) pick(sel.date, sel.shiftId); }
  function doAssign(c: Cand) {
    let reason: string | undefined;
    if (!c.eligible) {
      const r = prompt(`This breaks a hard rule:\n• ${c.hard.map((h) => h.message).join("\n• ")}\n\nReason for overriding? (leave blank to cancel)`);
      if (!r) return;
      reason = r;
    }
    const { date, shiftId } = sel!;
    start(async () => { await assign(s.id, date, shiftId, c.workerId, c.mode, reason); refresh(); });
  }
  function doUnassign(id: string) { start(async () => { await unassign(id); refresh(); }); }

  const selKey = sel ? `${sel.date}|${sel.shiftId}` : null;
  const selTpl = sel ? f.shifts.find((x) => x.id === sel.shiftId) : null;

  return (
    <div className="app">
      <header className="top">
        <h1>Riverside schedule</h1>
        <span className="meta">
          {s.startDate} → {dates[dates.length - 1]} · {s.status}
          {schedules.length > 1 && (
            <> · <select defaultValue={s.id} onChange={(e) => { location.href = `/?s=${e.target.value}`; }} style={{ font: "inherit" }}>
              {schedules.map((x) => <option key={x.id} value={x.id}>{x.startDate} ({x.status})</option>)}
            </select></>
          )}
        </span>
        <form action={createAction}><input type="date" name="start" /><button className="btn">New 2-week schedule</button></form>
        <div className="actions">
          {s.status === "draft" && (
            <>
              <button className="btn primary" disabled={pending} onClick={() => start(async () => { await autofill(s.id); })}>
                {pending ? "Filling..." : "Auto-fill"}
              </button>
              <button className="btn quiet" disabled={pending} onClick={() => start(async () => { await clearSchedule(s.id); })}>
                Clear assignments
              </button>
              <button className="btn quiet" onClick={() => start(() => publish(s.id))}>Mark published</button>
            </>
          )}
          <button className="btn quiet danger" onClick={() => { if (confirm("Delete this schedule? This can't be undone.")) start(() => removeSchedule(s.id)); }}>
            Delete
          </button>
        </div>
        <span className="status">
          {hard.length ? <span className="hard">{hard.length} must fix</span> : <span className="ok">Nothing blocking</span>}
          <span className="soft">{soft.length} tradeoffs</span>
        </span>
      </header>

      <div className="main">
        <div className="boardwrap">
          <table className="board">
            <thead>
              <tr>
                <th className="rowhead">Shift</th>
                {dates.map((d, i) => {
                  const dow = dayOfWeek(d);
                  return (
                    <th key={d} className={`day${dow === 0 || dow === 6 ? " weekend" : ""}${i === 6 ? " week-split" : ""}`}>
                      {WEEKDAY_SHORT[dow]} {Number(d.slice(8))}
                      <small>{dow === 3 || dow === 5 ? "PHP half day" : "\u00a0"}</small>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {f.shifts.map((t) => (
                <tr key={t.id}>
                  <th className="rowhead">{t.id}<small>{fmtInterval(t.interval)}</small></th>
                  {dates.map((d, i) => {
                    const key = `${d}|${t.id}`;
                    const here = bySlot.get(key) ?? [];
                    const vs = violBySlot.get(key) ?? [];
                    const slot = slots.find((x) => x.date === d && x.shiftId === t.id)!;
                    const worst = vs.some((v) => v.severity === "hard") ? "hard" : vs.length ? "soft" : "";
                    const gap = here.length < slot.demand;
                    return (
                      <td key={key} className={`cell${gap ? " gap" : ""}${worst ? " " + worst : ""}${selKey === key ? " selected" : ""}${i === 6 ? " week-split" : ""}`}>
                        <div className="slot">
                          {here.map((a) => {
                            const w = workers.get(a.workerId);
                            const custom = a.interval.start !== t.interval.start || a.interval.end !== t.interval.end;
                            return (
                              <div key={a.id} className="chip" style={{ background: w?.color ?? "#777" }} title={vs.filter((v) => v.workerId === a.workerId).map((v) => v.message).join("\n")}>
                                <span className="name">{w?.name ?? a.workerId}</span>
                                {a.ot && <span className="tag">OT</span>}
                                {a.fallback && <span className="tag">cover</span>}
                                {custom && <span className="time">{fmtInterval(a.interval)}</span>}
                                <button className="x" aria-label="Remove" onClick={() => doUnassign(a.id)}>×</button>
                              </div>
                            );
                          })}
                          <button className="slot-btn" onClick={() => pick(d, t.id)} aria-label={`Fill ${d} ${t.id}`}>
                            {gap ? <span className="empty-slot need">needs {slot.demand - here.length}</span>
                              : here.length === 0 ? <span className="empty-slot">optional</span> : null}
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="rail">
          {!sel ? (
            <>
              <h2>Issues</h2>
              <p className="sub">Click any item to jump to that shift.</p>
              {violations.length === 0 && <p className="hint">No issues. Schedule looks good.</p>}
              {hard.length > 0 && (
                <>
                  <h3 className="section-label hard-label">Must fix ({hard.length})</h3>
                  {hard.map((v, i) => (
                    <div key={"h" + i} className="viol hard">
                      <button onClick={() => v.date && v.shiftId && pick(v.date, v.shiftId)}>
                        <div>{v.message}</div>
                      </button>
                    </div>
                  ))}
                </>
              )}
              {soft.length > 0 && (
                <>
                  <h3 className="section-label soft-label">Not ideal ({soft.length})</h3>
                  {soft.map((v, i) => (
                    <div key={"s" + i} className="viol soft">
                      <button onClick={() => v.date && v.shiftId && pick(v.date, v.shiftId)}>
                        <div>{v.message}</div>
                        {v.quote && <div className="q">"{v.quote}"</div>}
                      </button>
                    </div>
                  ))}
                </>
              )}
            </>
          ) : (
            <>
              <h2>{WEEKDAY_SHORT[dayOfWeek(sel.date)]} {sel.date.slice(5)} · {selTpl?.label}</h2>
              <p className="sub">
                Best fit first. <button className="btn quiet" onClick={() => { setSel(null); setCands(null); }}>Back to issues</button>
              </p>
              {cands === null ? <p className="loading">{pending ? "Ranking…" : ""}</p> : (() => {
                const eligible = cands.filter((c) => c.eligible);
                const blocked = cands.filter((c) => !c.eligible);
                return (
                  <>
                    {eligible.map((c) => (
                      <div key={c.workerId} className="cand">
                        <div className="head">
                          <span className="swatch" style={{ background: c.color }} />
                          <span className="who">{c.name}</span>
                          {c.mode === "ot" && <span className="tag" style={{ fontSize: 11, color: "var(--soft)" }}>overtime</span>}
                          {c.mode === "fallback" && <span className="tag" style={{ fontSize: 11, color: "var(--ink-soft)" }}>covering</span>}
                          <span className="hours">{c.role === "staff" ? `${c.hours}h of ${c.target}h this week` : ""}</span>
                        </div>
                        {c.soft.length > 0 ? (
                          <ul className="why">
                            {c.soft.map((x, i) => <li key={i} className="s">{x.message}</li>)}
                          </ul>
                        ) : (
                          <p className="why-ok">Good fit, no issues</p>
                        )}
                        <div className="act">
                          <button className="btn primary" disabled={pending} onClick={() => doAssign(c)}>Assign</button>
                        </div>
                      </div>
                    ))}
                    {blocked.length > 0 && (
                      <>
                        <h3 className="section-label blocked-label">Can't work this shift</h3>
                        {blocked.map((c) => (
                          <div key={c.workerId} className="cand blocked">
                            <div className="head">
                              <span className="swatch" style={{ background: c.color }} />
                              <span className="who">{c.name}</span>
                            </div>
                            <ul className="why">
                              {c.hard.map((h, i) => <li key={i} className="h">{h.message}</li>)}
                            </ul>
                            <div className="act">
                              <button className="btn" disabled={pending} onClick={() => doAssign(c)}>Override</button>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
