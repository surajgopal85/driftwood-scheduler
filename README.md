# Riverside scheduler (v0.1)

Staff scheduling for Driftwood Recovery's Riverside site. Replaces the Google
Sheets + "chess" process with a 2-week board that **validates every edit** (P0)
and **ranks who can take a slot, with reasons** (P1). There is also a greedy
auto-draft (`npm run draft`) that uses the same ranker, so a generated draft is
explainable slot by slot.

Requires Node 22+ (uses the built-in `node:sqlite`; no native builds).

```bash
npm install
npm run seed            # data/facility.json + rules/v0.1.json + data/pto.csv -> data/rvs.db
npm run dev             # http://localhost:3000
npm test                # domain tests — run these after every rule change
```

Everyday commands:

| command | what it does |
| --- | --- |
| `npm run draft 2026-09-14` | new 2-week draft starting that Monday, greedily filled |
| `npm run validate [id]` | print every violation for a schedule, with the quote that caused it |
| `npm run pto:import data/pto.csv` | replace PTO from a `name,start,end` CSV (names matched via aliases) |
| `npm run rules:apply rules/vX.json [--from DATE] [--dry]` | diff a rule file against active rules and apply |
| `npm run db:reset` | wipe and reseed |

## How the app is organised

```
src/domain/   pure logic, no I/O — types, time, validate (P0), rank (P1)
src/db/       node:sqlite repo; rules table is append-only
src/app/      Next.js board + server actions
rules/        versioned rule files — the reviewed artifact
data/         facility.json (roster, shifts, demand, policy), pto.csv, rvs.db
scripts/      seed, rules-apply, import-pto, validate, draft
tests/        node:test against the real v0.1 rules
docs/         DESIGN.md (decisions), RULE-INTAKE.md (prose -> rule fields)
```

## Iterating the rule set (the methodology)

Rules are **data, versioned in files, never edited in the UI**. Gordon changes
his mind → you change a file → the diff is explicit and the history survives.

1. **Capture in his words.** During the meeting, write each statement down
   verbatim. That sentence becomes `source.text`. Don't translate live.
2. **Translate with the intake table** (`docs/RULE-INTAKE.md`). Each sentence
   becomes one or more rules with a stable `key` (`worker.slug`). Reuse an
   existing key when it's the same rule with new content; use a new key when
   it's a new rule. Set `confidence` honestly — below 0.8 means "ask again".
3. **Write `rules/v0.2.json`** by copying v0.1 and editing. Bump `version`,
   set `effectiveFrom` to the Monday the change should start applying.
4. **Dry run:** `npm run rules:apply rules/v0.2.json --dry` prints
   `+ added  ~ changed  - retired  = unchanged`. Read it as the change log.
5. **Regression:** `npm test`, then `npm run validate <last published id>` to
   see what the new rules would have flagged on a schedule he already ran.
   Surprises here mean either the rule is wrong or the old schedule was — ask.
6. **Apply** without `--dry`. Old rows get `effective_to` closed; new rows carry
   `supersedes`. Validating a schedule from before the change still uses the
   rules that were live then.
7. **Commit** the rule file and note the date.

Facility-level changes (roster, targets, demand per weekday, OT policy) live
in `data/facility.json` and are applied with `npm run seed` (upsert; safe to
re-run, does not touch schedules or PTO).

## Reading the board

- Grey cell = coverage gap. Red left edge = a must-fix. Amber = a tradeoff.
- A chip shows the worker's **actual interval** when it differs from the slot
  (Nick `9a–9p` inside AM, David `10p–8a` inside OVN). That's design decision 4.
- `OT` and `cover` tags mark the two non-regular modes.
- Click a cell → right rail ranks everyone. Greyed-out people show the hard
  rule they'd break and who can override it. "Override and assign" records a
  reason.

## Questions for Gordon (v0.1 assumptions to confirm)

1. **Demand.** v0.1 uses his app's defaults: 1 AM, 0 MID, 1 EVENING, 1 OVN per
   day. His sheet layout has two AM rows and two EVENING rows. At 1-per-slot
   there is only 168h/week to give out against ~430h of targets, so everyone
   runs under. Is real demand 2/1/2/1?
2. **Roster.** He said "10 team members". v0.1 has 13 active staff + 2 managers
   and 6 inactive names from the CSV. Who is actually on the team?
3. **Robin / Erin / Whitlee.** Their notes read like fixed schedules. v0.1 models
   them as `restrict` (may work only then). Should they be `require` (must be
   scheduled then)?
4. **"PM".** Does PM mean EVENING (3–11) only, or MID (12:30–8:30) too? v0.1
   assumes both for Erin's "M-Th PM".
5. **Nick.** Sat/Sun 9a–9p and a 6h Wednesday (7a–1p) = 30h. Confirm the
   Wednesday interval.
6. **Managers.** Kacy up to 4 AM/MID covers, Gordon up to 1 — per week, right?
7. **The retro check.** Ask for his last 3 published schedules. Enter them as
   schedules and run `npm run validate`. Every flagged hard violation is either
   a rule we got wrong or a rule he broke on purpose — both are useful.

## Not in v0.1 (deliberately)

- Rule editing in the UI (files + `rules:apply` instead).
- Employee-facing anything (PTO submission, swaps, call-outs, read-only view).
- A real solver. `draft` is greedy; the ranker is the product.
- Cloud sync, auth, mobile. It runs on one machine. Back up `data/rvs.db`.
