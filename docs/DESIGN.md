# Design decisions

Recorded so the next change can argue with the reasoning, not rediscover it.

## 1. Rule model: three axes, not one enum

Gordon's app had `hardRules[]` / `softPreferences[]` with a type string. That
conflated *whether the solver may break it*, *what breaking it costs*, and
*who may authorise breaking it*. The v0.1 `Rule` separates them:

- `bindingness` — hard (filter) vs soft (penalty). What the solver does.
- `cost` — annoyance → morale → contractual → regulatory. What the UI *says*.
- `overridableBy` — gordon / director / none. What the assisted-fill lets you do.
- `weight` — numeric tiebreak, defaulted from `cost`, overridable per rule.

Category explains; number sorts. Neither alone does both jobs.

## 2. Time: recurrence ⟂ effectivity

`scope.days` says *which* Thursdays. `effective.{from,to}` says *whether the
rule is live at all* on a date. `to` is required; `9999-12-31` means forever.
`inEffect(rule, date)` is the only function that answers the question and
everything calls it. Temporary exceptions are additional narrow rules, never
mutations of the standing rule.

## 3. Versioning: supersede, never edit

`rules` is append-only. An edit closes the old row's `effective_to` and
inserts a new row with `supersedes`. Consequence: validating an old schedule
uses the rules that were live then, so "did we get preferences right last
month?" is answerable — and that is the test of the "preferences don't change"
assumption. Cost at this scale (~40 rules) is nil.

## 4. Slot is a container; assignment owns its interval

`Slot { date, shiftId, demand, capacity }` is computed from templates.
`Assignment { …, interval, hours }` carries the actual worked time. Nick's
Sat 9a–9p is an AM-slot assignment with a 12h interval; David's OVN is 10h.
Hours accounting sums assignment hours. No shift rows are ever spawned to
represent a person.

## 5. Hours target is a soft objective that PTO lowers

`adjustedTarget = target − (PTO days this week × target/5)`. Being under is a
low-weight soft signal that mostly steers the ranker; being over is a
`contractual` soft violation unless flagged OT. The old app's hard 40h cap +
deficit magnet is what dragged PTO'd people back onto the board.

## 6. No runtime preference parsing

Free text is parsed once, by a person, using `docs/RULE-INTAKE.md`, into a
reviewed file. The regex/LLM parser was the largest source of unusable
schedules (comma-splitting "Mon, Wed, Fri"; pass 2 of the solver ignoring
parsed rules). Ten people × ~4 rules doesn't need automation; it needs a diff.

## Things I chose not to do yet

- Coverage by *time band* (hours covered per interval) instead of by slot
  headcount. It would let Nick's 9–9 count against AM and EVENING at once.
  Not needed until Gordon confirms demand shape (README question 1).
- A solver. The ranker + greedy draft got 0 hard violations on seed data;
  revisit only if cleanup time after `draft` is still high.
