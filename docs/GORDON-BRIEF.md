# Riverside Scheduler — for Gordon

## What changed from the old approach

You've been building the RVS 2-week schedule by hand in Google Sheets every other Wednesday. You know every person's availability, preferences, and restrictions — but it's all in your head. That means:

- It takes hours every time
- If something changes last minute (someone quits, PTO comes in), you're redoing work from scratch
- There's no easy way to check "did I accidentally break one of Robin's rules?" without scanning every cell

The earlier tool (the single-file HTML version) tried to solve this but produced schedules that didn't make sense and lost your data. That experience understandably made you cautious.

This is different. We didn't try to replace your judgment — we wrote down your rules and built a tool that applies them the same way you do, just faster.

## What we built

A scheduling app at **https://driftwood-scheduler.fly.dev/** that:

1. **Knows everyone's rules.** Beth is AM only. David works 10p-8a. Robin does Sun/Mon evening, Tuesday mid, Wednesday AM. Nick does Wednesday morning and weekends 9-9. All 40 rules came from your own words — we can show you exactly which quote each rule came from.

2. **Fills ~70-80% of the schedule automatically.** Click "Auto-fill" and it assigns everyone to shifts following those rules. It picks the best fit for each slot: who needs more hours that week, who's already working that shift on other days, who has the fewest conflicts.

3. **Shows you what's wrong in plain language.** The right side of the screen says things like "Beth: 24h of 40h target" or "Stephanie can't take Tuesday EVENING" — not codes or numbers. Red means must fix. Amber means not ideal but your call.

4. **Lets you override anything.** Click any cell, see who can take it and why, and assign them. If you want to put someone where the rules say they shouldn't be, it asks why and lets you do it anyway. You're the boss, not the algorithm.

5. **Doesn't lose your work.** The data lives on a server. No cloud sync surprises. You can delete a schedule on purpose, but nothing disappears on its own.

## How it helps you

**Before:** Start with a blank sheet. Spend hours placing people. Hope you didn't miss a conflict. Repeat every 2 weeks.

**Now:** Click "New 2-week schedule," click "Auto-fill," spend 20-30 minutes reviewing and adjusting the handful of things the algorithm couldn't figure out. Click "Mark published" when it's done.

When something changes — someone leaves, someone's availability shifts — Suraj updates the rules and the next schedule automatically reflects the change. No re-learning, no starting over.

## How to use it

### Every other Wednesday (schedule building)

1. Open **https://driftwood-scheduler.fly.dev/**
2. Pick the Monday start date, click **New 2-week schedule**
3. Click **Auto-fill** — watch the board fill up
4. Look at the right sidebar:
   - **"Must fix"** (red) = shifts that need a person, or someone placed where they can't be. Click to jump to the cell.
   - **"Not ideal"** (amber) = someone below their target hours, or working outside their preference. OK to leave if there's no better option.
5. Click any cell to see who can take that shift, ranked best-fit-first
   - Green "Good fit, no issues" = safe to assign
   - Amber = tradeoffs listed, still assignable
   - "Can't work this shift" = breaks a hard rule, but you can override with a reason
6. Adjust until you're happy. Click **Mark published**.

### If you need to start over

- **Clear assignments** wipes the board but keeps the schedule — you can Auto-fill again
- **Delete** removes the schedule entirely

### If something looks wrong

Tell Suraj. Possible causes:
- A rule is wrong (we guessed from your old schedules — some guesses may be off)
- Someone's hours target is wrong
- Someone is listed who shouldn't be (or someone is missing)

All of these are quick fixes. Suraj updates a file, the app picks it up next time.

## How we update it together

The rules are stored in a file that tracks where each rule came from (your exact words). When something changes:

1. You tell Suraj what changed ("Robin can't do Sundays anymore" / "We hired someone new" / "Zach is back to OVN only")
2. Suraj updates the rules file and the roster
3. The app redeploys automatically
4. Next time you build a schedule, the new rules are in effect

Nothing from the old rules disappears — they're versioned, so we can always go back and check what the rules were at any point in time.

## What we need from you (for the meeting)

A few things we're not sure about yet:

1. **Who is RVS vs. DRC?** We have some people (Kate H., Kate M., Toni, Whitlee, Erin) who might be DRC staff, not RVS. Can you confirm who belongs on the RVS board?

2. **New staff details.** We added Charlie, Alex, Maddie, Brad P., and Aimee from your published schedules. Are their hours/availability right? Anything we missed about their rules?

3. **MID shifts.** Your published schedules don't show a regular MID (12:30-8:30) slot — is that correct, or is it situational?

4. **Zach W.** After Michelle left, he started doing AM and EVENING shifts. Is that permanent or temporary?

5. **Michelle's replacement.** Are the current staff covering her hours long-term, or is someone new coming?

The more accurate the rules, the less you have to fix by hand each time.
