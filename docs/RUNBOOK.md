# Runbook: Driftwood Riverside Scheduler

## Overview

Shift scheduling app for Driftwood Recovery's Riverside site (behavioral health). Produces 2-week Mon--Sun schedules.

| Shift | Time | Demand/day |
|-------|------|------------|
| AM | 7a--3p | 2 |
| MID | 12:30p--8:30p | 1 |
| EVENING | 3p--11p | 2 |
| OVN | 11p--7a | 1 |

**6 shifts/day = 48 person-hours/day = 336h/week.**

13 active staff + 2 managers (Kacy: up to 4 cover shifts/week, Gordon: up to 1). Managers are never auto-scheduled.

Stack: Next.js 15, Node 22 built-in SQLite (`data/rvs.db`), runs on one machine.

---

## For Gordon (UI workflow)

### Creating a schedule
1. Pick a date in the date picker (top bar). It snaps to that Monday.
2. Click **New 2-week schedule**.

### Auto-filling
Click **Auto-fill** in the header. The algorithm fills every slot best-fit-first using the same ranking you see when you click a cell. It fills all 84 slots (6/day x 14 days) in one pass.

### Reading the issues panel (right sidebar)
- **Must fix** (red) -- coverage gaps, hard rule violations. These must be resolved before publishing.
- **Not ideal** (amber) -- someone working outside their preference, hours below target. OK to leave if no better option.

Click any issue to jump to that cell.

### Assigning / unassigning
- Click a cell to see who can take it, ranked best-fit-first.
- **Green "Good fit, no issues"** -- safe to assign.
- **Amber items** -- tradeoffs listed in plain language. Still assignable.
- **"Can't work this shift"** section -- hard rule violations. You can override (prompts for a reason).
- Click the **x** on a name chip to unassign.

### Managing schedules
- **Clear assignments** -- wipes all assignments from the current schedule so you can re-draft.
- **Delete** -- removes the schedule entirely (confirmation required, can't undo).
- **Mark published** -- locks the schedule. Auto-fill, clear, and assign buttons disappear.

### Schedule switcher
If multiple schedules exist, use the dropdown in the header to switch between them.

---

## For Suraj (developer ops)

### CLI commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start dev server (localhost:3000) |
| `npm run seed` | Load facility.json + rules + PTO into DB |
| `npm run db:reset` | Delete DB and reseed from scratch |
| `npm run draft <YYYY-MM-DD>` | Create a schedule and greedy-fill it |
| `npm run validate [schedule-id]` | Print all violations for a schedule |
| `npm run rules:apply rules/vX.json --dry` | Preview rule changes (diff) |
| `npm run rules:apply rules/vX.json` | Apply rule changes |
| `npm run pto:import data/pto.csv` | Import PTO ranges |
| `npm test` | Run 10 domain tests |

### Config files

| File | Contents |
|------|----------|
| `data/facility.json` | Workers (name, hours target, OT eligibility, color), shift templates (times, demand, capacity), policy |
| `rules/v0.1.json` | 34 scheduling rules with Gordon's verbatim quotes |
| `data/pto.csv` | PTO ranges per worker |
| `data/rvs.db` | SQLite database (safe to delete and reseed) |

### Adding or changing a worker
1. Edit `data/facility.json` -- add/modify the worker entry.
2. Run `npm run seed` (or `npm run db:reset` for a clean slate).

### Updating rules
1. Copy `rules/v0.1.json` to `rules/v0.2.json`.
2. Edit the new file. Bump version, set `effectiveFrom`.
3. `npm run rules:apply rules/v0.2.json --dry` -- review the `+ ~ - =` diff.
4. `npm test` -- make sure nothing breaks.
5. `npm run rules:apply rules/v0.2.json` -- apply for real.
6. `npm run validate <schedule-id>` -- check against an existing schedule.

See `RULE-INTAKE.md` for the translation methodology (verbatim quote -> kind/bindingness/cost/override/effectivity).

---

## Key architecture decisions

1. **Rule = three axes + weight.** `bindingness` (hard = blocked, soft = penalized), `cost` (annoyance/morale/contractual/regulatory -- what the UI says), `overridableBy` (gordon/director/none -- what the UI allows). `weight` is a numeric tiebreak.

2. **Recurrence and effectivity are separate.** `scope.days` = which days of the week. `effective.from/to` = whether the rule is active at all. Temporary exceptions are new narrow rules, not edits.

3. **Supersede, never edit.** Rules are immutable rows. A change closes the old rule and inserts a new one pointing back. This means you can validate last month's schedule against last month's rules.

4. **Slot is a container; assignment owns its interval.** Nick's Sat 9a--9p is an AM-slot assignment with a custom 12h interval. No extra shift templates needed for custom hours.

5. **Greedy draft, not a solver.** The auto-fill uses the same ranker the UI shows. It fills slots in date order, picking the top eligible candidate each time. It never backtracks. If the result isn't good enough, the retro check (validating Gordon's actual past schedules) will tell us whether a solver is worth building.
