# Rule intake: prose → fields

Use this table when translating a sentence from Gordon (or a worker's note)
into `rules/vX.json`. One sentence often yields two rules — a hard one and a
soft one. Keep the sentence verbatim in `source.text`; put the words that
justify *this* rule in `source.quote`.

## 1. Kind

| the sentence says | kind | scope |
| --- | --- | --- |
| "no X", "can't do X", "never X", "X off" | `forbid` | the X |
| "only X", "X only", "just X", a fixed list of days/shifts | `restrict` | the allowed set |
| "always X", "is on X", "works every X", a fixed schedule | `require` | the X (add `shifts` if stated) |
| "no more than N in a row", "N days off together", "one weekend day off", "4 days a week" | `pattern` | leave `scope: {}` |
| "prefers X", "would like X", "ideally X" | `forbid` the *complement*, or `restrict` to X — **soft** | |

Scope semantics:
- `days` only → whole days. `shifts` only → those shifts any day.
- `days` + `shifts` on a `forbid` → those shifts on those days.
- `days` + `shifts` on a `restrict` → **on those days**, only those shifts; other days unaffected.
  For "only works Mon/Wed/Fri" *and* "only AM on Mon", write two `restrict` rules.
- `interval` → the worked time when this rule matches (Nick `09:00–21:00`). Put it on the
  rule that names the day, not on a generic one.

## 2. Bindingness — will the schedule be *wrong* or just *worse*?

| | `hard` | `soft` |
| --- | --- | --- |
| solver | filters the person out (shows greyed with reason) | adds a penalty, still offered |
| words | can't, never, only, must, always, "therapy", "class", "other job" | prefers, would like, ideally, "if possible", "hit or miss" |

If you can't tell, ask: "If I scheduled you there anyway, would you be unable to come, or just unhappy?"

## 3. Cost — what does breaking it *mean*? (drives the explanation + default weight)

| cost | weight | examples |
| --- | --- | --- |
| `annoyance` | 1 | prefers AM, likes Fridays off |
| `morale` | 3 | weekend day off, two days off together, therapy day |
| `contractual` | 8 | agreed hours/days, part-time arrangement, "AM only" as a hiring condition |
| `regulatory` | 20 | OT policy, coverage minimums, double-booking without OT approval |

## 4. Override authority — who is allowed to break it?

| `overridableBy` | meaning |
| --- | --- |
| `gordon` | Gordon can place someone there and record a reason |
| `director` | needs his boss (OT beyond policy, second OT in a week) |
| `none` | nobody schedules through it (PTO, a worker's fixed outside commitment, David's 10p–8a) |

`hard` + `gordon` is normal for "I'd rather not, but I can if I must." `hard` + `none` is rare — use it only when the worker genuinely cannot show up.

## 5. Effectivity

- Standing rule: `effectiveFrom` of the file, `to` omitted (= forever).
- Temporary change ("for 3/30–4/6 I'm free all week"): a **second** rule with a narrow
  `effectiveTo`, not an edit to the standing one. Name it `evan.mwf.exception-2026-03-30`.
- A worker leaving / changing arrangement: retire by dropping the key from the next file.

## 6. Checklist before `rules:apply`

- [ ] every rule has `key`, `workerId`, `kind`, `scope`, `bindingness`, `cost`, `overridableBy`, `source`
- [ ] `confidence` < 0.8 on anything you inferred — those get asked next meeting
- [ ] no rule uses `null` for a date
- [ ] `npm test` passes; `npm run rules:apply <file> --dry` shows only the changes you meant
