# Program Gravity — Design Spec (for Codex)

## Intent
A $55M Texas and a $55M Boston College should not be the same team. In reality,
programs have structural edges: skill talent wants to play at Texas, trench
talent gets developed at Iowa/Wisconsin, DBU is a real thing. Program Gravity
models this as **recruiting gravity**: at certain programs, $1M buys more than
$1M of specific position groups.

This is a *market* effect, not flat power. It changes the build puzzle per
program ("where does $55M go furthest?") instead of just re-tiering programs.

## Core mechanic
- Each program may have 1–2 gravity tags. A tag = a position group + an
  efficiency multiplier (10–20%, never above 20%).
- Implementation: when computing ratings in `lib/simulator.ts`, use
  `effectiveSpend = spend × (1 + gravity)` for tagged groups. The $55M budget
  math is untouched — every dollar still costs a dollar; gravity only changes
  what the dollar *buys*. Diminishing returns apply to effective spend.
- Gravity is part of the **roster** (the student), never the schedule (the exam).
  The honest-test invariant stands.

## The toggle (required)
- Build setup gets a "Program gravity" toggle: **On** (default — the realistic
  game) / **Off** ("Pure parity" — today's game, $55M buys the same everywhere).
- The choice is stored in the publish payload (`gravityOn`, `gravityVersion`).
- Server replay applies the identical gravity table. Leaderboard stays fair
  because expected wins are computed *with* gravity applied (see below).

## Acceptance rule (superseded by the user after quantitative tuning)
Keep the researched tags and the existing scoring model. Verify with
`scripts/tune-playoff.ts` at the $55M cap for every tagged program:
- Directionality: leaning into gravity yields a larger expected-win gain than
  allocating as little as possible to tagged groups under the exact cap.
- Controlled monotonicity: on the same roster, program and schedule, a larger
  tag yields a larger measured gain than a smaller tag.
- Report each program's measured gain honestly; no minimum gain is required.
  The UI shows the effective dollar values from the table without inflation.

The original +0.5–1.0 win target, then +0.1–0.3, were superseded after the
model produced smaller measured effects with the researched tags.

## Gravity table — v1 (researched 2026-09-24, 2026 season)

Researched from 2023–2026 NFL Draft output by position, 2026 coaching staffs,
recruiting track record, durable program identity, and 2024–26 on-field unit
strength. 40 of 68 programs carry tags; 28 have no genuine position-group
identity and are untagged rather than invented. No tag above +20%; no program
above +25% combined. Data source: `data/program-gravity.json`
(`~/workspace/your_files/program-gravity.json` for the Codex handoff).

| Program | Gravity |
|---|---|
| Alabama | OL +16% |
| Arizona | WR +13%, OL +10% |
| Arizona State | WR +16% |
| Auburn | DL +13% |
| Boston College | OL +15% |
| Clemson | DL +17% |
| Colorado | WR +12% |
| Florida State | DL +13%, DB +10% |
| Georgia | LB +18% |
| Illinois | DB +13% |
| Indiana | QB +14% |
| Iowa | OL +13%, ST +12% |
| Kansas State | DB +12%, OL +10% |
| Kentucky | DB +10% |
| LSU | WR +18% |
| Maryland | WR +12% |
| Miami | DL +14%, OL +11% |
| Michigan | OL +15%, DL +10% |
| Missouri | DL +14% |
| North Carolina | QB +11%, RB +10% |
| Northwestern | OL +12% |
| Notre Dame | OL +15%, DB +10% |
| Ohio State | WR +20% |
| Ole Miss | WR +17% |
| Oregon | OL +11% |
| Penn State | LB +19% |
| Pitt | DL +11% |
| SMU | WR +10% |
| South Carolina | DB +13%, DL +10% |
| TCU | WR +15%, DB +10% |
| Tennessee | DL +10% |
| Texas | RB +12% |
| Texas A&M | DL +16% |
| Texas Tech | DL +16% |
| UCLA | LB +12% |
| USC | WR +15% |
| Utah | OL +17% |
| Wake Forest | DB +10% |
| Washington | WR +14% |
| West Virginia | OL +12% |

Untagged (no invented identity): Arkansas, BYU, Baylor, California, Cincinnati,
Duke, Florida, Georgia Tech, Houston, Iowa State, Kansas, Louisville,
Michigan State, Minnesota, Mississippi State, NC State, Nebraska, Oklahoma,
Oklahoma State, Purdue, Rutgers, Stanford, Syracuse, UCF, Vanderbilt, Virginia,
Virginia Tech, Wisconsin.

Notable deltas vs the original brainstorm table: Texas is RB (longest active RB
draft streak), not QB/WR — the research found no current Texas QB pipeline.
Georgia is LB only (ESPN's Linebacker U, 8 drafted since 2018), not DL/OL; the
combined cap forced the choice and LB is the sharper identity. Florida drops out
entirely — its DB/WR identity is a decade old with no current pipeline.
Wisconsin's old RBU identity is dead (zero 2026 draftees). Indiana gains QB
(Mendoza: 2025 Heisman, #1 overall 2026, 16-0 title). Review cuts made after
research: NC State LB (one-player tag), USC QB and Washington OL
(researcher-flagged soft second tags). Cut data is preserved in the research
partials if you want any of them back.

The versioned table lives only in `data/program-gravity.json`; `lib/gravity.ts`
loads and validates it. The researched magnitudes are fixed for v1.

## UI (gravity must be visible as dollars, not vibes)
- **Team page:** a "Program gravity" block, e.g. "At Texas, $1M buys $1.12M of
  running back talent." Directly beside it, the counterweight: schedule difficulty
  ("…but you'll face a top-5 slate"). Edge and price, side by side, always.
- **Builder:** tagged groups get a badge; the position panel shows the effective
  rate ("$4.0M → plays like $4.6M"). Auto-optimize becomes gravity-aware
  (`cappedOptimalAllocation` must account for effective spend in its marginal
  gain water-filling).
- **Season report / share page:** gravity badge on the season ("Gravity on · v1").

## Leaderboard fairness
`preseasonExpectedWins()` must be gravity-aware. Overachievement (wins minus
expected) then stays comparable across gravity-on/off and across programs —
a Texas edge is priced into its expectation. Rank the **overachievers** board
first; it is the board gravity can't distort.

## Counterweight principle
Every gravity needs a visible cost. The built-in one is schedule difficulty
(Texas: great gravity, brutal slate; BC: no gravity, easy slate). If a program
ends up dominant on both axes after tuning, cut its gravity before touching its
schedule — the schedule is the honest exam and doesn't move.

## Verification
- `npx tsc --noEmit`, `npm run build`
- `scripts/tune-playoff.ts`: confirm directionality and controlled monotonicity
  per tagged program, and report measured gains in `docs/gravity-tuning.md`
- One published gravity-on season replays identically on the server
- Update the repo's AGENTS.md: add gravity to the sacred invariants
  (mechanic, toggle, tuning criterion, version).
