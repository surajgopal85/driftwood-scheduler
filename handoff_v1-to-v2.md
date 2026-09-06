# Handoff: Riverside scheduler — v0.1 → v0.2 prep

**Suggested model:** Sonnet, default effort. This is still methodology/config/UI work, not domain-model redesign. Escalate only if the conversation turns into changing `types.ts` / `validate.ts` / `rank.ts`, the demand model shape, or adding a solver.

**Your role:** Suraj is a full-stack engineer prepping to onboard Gordon (non-technical) into a scheduling app. He wants to build independence, not lean on the assistant — ask before doing things for him, prefer concrete examples over abstraction, quiz him occasionally on the patterns marked ⟡.

---

## Part 1 — Original context (from prior session)

### Situation
Gordon supervises shift scheduling at Driftwood Recovery's Riverside site (behavioral health). Builds a 2-week Mon–Sun schedule every other Wednesday in Google Sheets by hand. Not a developer. Previously built a single-file HTML scheduler with Claude Cowork that produced unusable schedules and once wiped his data via a botched cloud sync — trust is worth rebuilding carefully. Suraj is doing this as a favor, meeting Gordon in person to gather rules. Goal: ~70% usable generated schedule so Gordon's job becomes cleanup, not building.

Shifts: AM 7a–3p, MID 12:30p–8:30p, EVENING 3p–11p, OVN 11p–7a (David 10p–8a, Zach 11p–7a Mon–Wed only). One OVN person per day. Managers Gordon and Kacy are never auto-scheduled; Kacy covers up to 4 AM/MID shifts/week, Gordon up to 1. OT = at most one extra OVN double per person per week.

### What's built (v0.1)
Next.js 15 + Node 22 built-in SQLite, runs on one machine.

| Layer | What it does |
| --- | --- |
| P0 validator (`src/domain/validate.ts`) | Every board edit checked; each problem is a `Violation` with severity (hard/soft), cost, who can override, and the source quote that caused it. |
| P1 ranker (`src/domain/rank.ts`) | Click a slot → everyone ranked by fewest new tradeoffs, then furthest below target hours. Blocked people show the rule they'd break. |
| Draft (`npm run draft <monday>`) | Greedy fill using the same ranker. 0 hard violations on seed data. Not a solver — never backtracks. |
| Rules as data (`rules/v0.1.json`) | 34 rules, stable `key`, Gordon's verbatim sentence, confidence. `rules:apply` diffs by key, supersedes rather than edits. |
| Tests (`npm test`) | 10 domain tests against the real rule file. |

Commands: `npm run seed` · `npm run dev` · `npm run draft 2026-09-14` · `npm run validate [id]` · `npm run rules:apply rules/vX.json --dry` · `npm run pto:import data/pto.csv`.

### The four design decisions (settled — don't reopen unless asked)
1. **Rule = three axes + a weight.** `bindingness` (hard = filtered out, soft = penalized), `cost` (annoyance/morale/contractual/regulatory — what the UI *says*), `overridableBy` (gordon/director/none — what the UI *allows*). `weight` is a numeric tiebreak defaulted from cost.
2. **Recurrence ⟂ effectivity.** `scope.days` = which days. `effective.from/to` = whether the rule is live at all. `to` is required; `9999-12-31` means forever. Temporary exceptions are separate narrow rules, never edits.
3. **Supersede, never edit.** Rules are immutable rows; a change closes the old one and inserts a new one pointing back. Validating last month's schedule uses last month's rules.
4. **Slot is a container; assignment owns its interval.** Nick's Sat 9a–9p is an AM-slot assignment with 12h. No shift rows get invented for people.

Plus: hours target is a soft objective PTO lowers (target − PTO days × 8), and no runtime parsing of prose — a human translates once using the intake table.

### Methodology for evolving rules
1. Write down what Gordon says verbatim → `source.text`.
2. Translate with `RULE-INTAKE.md` (kind/bindingness/cost/override authority/effectivity). Confidence < 0.8 = ask again.
3. Copy `rules/v0.1.json` → `rules/v0.2.json`, edit, bump version, set `effectiveFrom`.
4. `npm run rules:apply rules/v0.2.json --dry` → read the `+ ~ - =` diff as the changelog.
5. `npm test`, then `npm run validate <last published schedule>`.
6. Apply for real. Commit.

**Retro check (highest-value ask):** Gordon's last 3 published schedules → enter as schedules → run `validate`. Every hard flag is either a rule we got wrong or one he broke on purpose. Tests the "preferences don't change" assumption.

### Open questions for Gordon (v0.1 assumptions) — status as of this session
1. ~~Demand: 1/0/1/1 vs 2/1/2/1~~ → **Suraj applied 2/1/2/1 to `data/facility.json` this session, pending Gordon's confirmation tomorrow** (see Part 2).
2. Roster: "10 team members" vs. 13 active + 2 managers + 6 inactive in the CSV — still open.
3. Robin/Erin/Whitlee modeled as `restrict` (may only work then) — should be `require` if "always on those days" — still open.
4. Does "PM" mean EVENING only, or MID too? — still open.
5. Nick Wed 7a–1p (6h) as part of his 30h total — needs confirmation — still open.
6. Kacy 4 / Gordon 1 cover shifts — per week? — still open.

### FAQ script (Gordon-facing + Suraj-facing) — unchanged, see prior handoff for full text. Key patterns marked ⟡:
- Rules live in a file, not a form, because the diff/changelog/regression-check is the point, not the form.
- Rule = 3 fields not `hard|soft` because override authority and explanation text vary independently of bindingness.
- Supersede not update, for retroactive trust — "was this schedule valid under the rules at the time?"
- Lessons: check existing mechanisms before reaching for new ones (the "Nick lowers weekend demand" trap was a data bug, not a modeling gap); validators surface data errors as loud as code errors; diff by identity not rendered text; nullable-means-forever is a footgun.

---

## Part 2 — This session's decisions

**1. `npm run draft` capability, honestly assessed:** it produces a fully-filled board with 0 *hard* violations on seed data — but "0 hard violations" and "80% usable" are different claims. Nobody has yet measured the *soft*-violation load a greedy, non-backtracking fill produces, or compared it to Gordon's own manual output. That measurement (via the retro check) is still the top priority, not further ranker tuning.

**2. Demand fix applied.** Updated `data/facility.json`:
   - `AM.demand`: `[1,1,1,1,1,1,1]` → `[2,2,2,2,2,2,2]`
   - `MID.demand`: `[0,0,0,0,0,0,0]` → `[1,1,1,1,1,1,1]`
   - `EVENING.demand`: `[1,1,1,1,1,1,1]` → `[2,2,2,2,2,2,2]`
   - `OVN.demand`: unchanged (already `[1,1,1,1,1,1,1]`)
   - Capacity arrays were already `2/1/2/1` across the board — no capacity change needed.
   - **Behavior change to watch for:** demand now exactly equals capacity in every slot, meaning zero slack anywhere. Any PTO/callout will now surface as an immediate uncovered-shift flag rather than being silently absorbed. This is a real behavior shift, not just a number tweak, and should be re-tested with `npm run seed && npm run draft` before tomorrow's meeting.
   - **This is still an assumption pending Gordon's confirmation tomorrow, not a settled fact.**

**3. Sidebar UI redesign — problem identified, not yet solved.** Current right-hand assign panel exposes ranker internals (tradeoff counts, "fewest tradeoffs / lowest hours" scoring) that are unreadable for a non-technical user. Three layout directions discussed:
   - **Option A — Single pick, plain sentence.** Top-ranked person only, name + one auto-generated plain-language reason (from `cost` category + `source.text`), one Assign button. "See other options" expands a short list. Blocked people hidden unless expanded. Fastest for Gordon, least visibility into close calls.
   - **Option B — Traffic-light list, no numbers.** All eligible people, colored dot (green/amber) + one-sentence reason, sorted by existing rank but rank itself invisible. Blocked people below a divider with plain-text blocking rule. Closest to current information density, just de-jargoned.
   - **Option C — Conversational suggestion card.** "Suggest: Kate H. — because... [Assign] [See other options] [I'll pick manually]." Matches the FAQ tone already written. Most implementation work since it's a different interaction pattern, not a re-skin.
   - Suraj is thinking through the underlying design question — "what's the minimum info Gordon needs to trust a suggestion without seeing the mechanism?" — before picking a direction. **No option has been chosen yet.**

---

## Part 3 — Next steps for Claude Code

1. **Re-validate after the demand change.** Run `npm run seed && npm run draft <upcoming-monday>` against the new `2/1/2/1` demand config. Compare hard/soft violation counts to the prior `1/0/1/1` run. Flag anywhere the zero-slack behavior (demand == capacity) produces new uncovered-shift errors that wouldn't have shown up before.
2. **Build the retro check.** Take Gordon's last 3 published schedules (once he provides them), import as schedules, run `npm run validate` against each. Categorize every hard flag as either (a) a rule the model got wrong, or (b) a deliberate override Gordon made on purpose. This is the actual measurement of "how good is draft," not the seed-data 0-violation number.
3. **Hold off on any solver work.** Per the settled design decisions, don't build backtracking/optimization until the retro check shows greedy-fill's soft-violation cost is actually a problem worth solving.
4. **Sidebar UI: wait for Suraj's direction.** He's choosing between Options A/B/C above (or a variant) after thinking through the trust question. Don't implement UI changes until he specifies which direction, but the underlying data needed for all three is the same: top-ranked person's plain-language reason string, derived from `cost` + `source.text`, with the numeric score/tradeoff count stripped from anything Gordon-facing.
5. **Prep the open-questions list for tomorrow's meeting** (roster count, Robin/Erin/Whitlee require-vs-restrict, "PM" meaning, Nick's Wednesday 6h, Kacy/Gordon cover-shift cadence) — these are still unresolved and should get answered in the meeting per the methodology in Part 1.