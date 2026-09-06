import { loadFacility, listSchedules, getSchedule, listAssignments } from "@/db/repo";
import { validate, slotsFor } from "@/domain/validate";
import { weekStart, addDays } from "@/domain/time";
import { Board } from "./board";
import { createFromForm } from "./actions";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s: sid } = await searchParams;
  const f = loadFacility();
  const schedules = listSchedules();
  const schedule = sid ? getSchedule(sid) : schedules[0];

  if (!schedule) {
    return (
      <div className="app">
        <div className="top"><h1>Riverside schedule</h1>
          <form action={createFromForm}><input type="date" name="start" /><button className="btn primary">Start a 2-week schedule</button></form>
        </div>
        <p style={{ padding: 20 }}>No schedules yet. Pick any date in the first week; it snaps to that Monday.</p>
      </div>
    );
  }

  const assignments = listAssignments(schedule.id);
  const violations = validate(f, schedule, assignments);
  const slots = slotsFor(f, schedule);

  return (
    <Board
      facility={f}
      schedule={schedule}
      schedules={schedules}
      assignments={assignments}
      violations={violations}
      slots={slots}
      createAction={createFromForm}
    />
  );
}
