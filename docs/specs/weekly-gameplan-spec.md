# Weekly Gameplan — Design Spec (for Codex)

## Intent
Turn the season from a movie into a game. This is the **OC/DC seat**: GM builds
the roster (the builder), OC/DC calls the weekly gameplan, HC owns the season
and career. Two decisions per week, three big thumb-friendly buttons each —
a 10-minute phone session, not a spreadsheet.

## The decision
Every week of Season Mode (including postseason), before the reveal, the player
picks:
- **Offensive tendency** (pick 1): "Air it out" · "Balanced" · "Ground & pound"
- **Defensive tendency** (pick 1): "Blitz heavy" · "Base defense" · "Bracket their WR1"
- Plus an "Auto gameplan" toggle: when on, every week resolves as
  Balanced + Base defense (the movie mode). Quick Sim always uses
  Balanced + Base defense.

## Scheme tags (shared data)
Each program carries two tags (data file: `data/scheme-tags.json`, table to be
supplied separately from research):
- `offTag`: `air-raid` | `spread` | `pro-style` | `power-run`
- `defTag`: `4-3` | `3-4` | `4-2-5` | `3-3-5` | `multiple`
- Non-Power-4 opponents (FCS etc.): neutral tags `spread` / `multiple`.
- The player's own team is always base `4-2-5` (matches the playsheet); the
  gameplan tendencies are adjustments on top, not a scheme change.
- **Internal review scaffolding:** `confidence` and `note` fields in the data
  file exist for design review only. Never render them in the UI, share pages,
  OG images, or API responses. The player-facing surface always presents tags
  with conviction.

## Counter matrix (win-probability points, applied to pre-game win prob)
**Offense**
- Air it out: base +1. vs `3-4`/`4-3` → +4 (linebackers in space). vs `3-3-5` →
  −3 (disguise + pattern-match). vs `4-2-5`/`multiple` → +1.
- Balanced: +2 vs `multiple` defenses (a hybrid front cannot key on a tendency); 0 everywhere else.
- Ground & pound: base +1. vs `3-3-5` → +4 (light boxes). vs `4-3`/`3-4` → −3
  (stacked fronts). vs `4-2-5`/`multiple` → +1.
**Defense**
- Blitz heavy: vs `air-raid`/`pro-style` → +5 (pocket passers). vs `power-run` →
  −5 (gashed). vs `spread` → −2 (QB run / quick game beats the blitz).
- Base defense: 0, always. ("Trust the $30M. Play sound, assignment defense.")
- Bracket their WR1: vs `air-raid`/`spread`, or when the opponent's best
  position group is WR → +4. Otherwise → −2 (wasted resources, soft elsewhere).

**Clamp:** offense pick + defense pick combined is clamped to [−8%, +8%].
Roster quality must remain the dominant factor — gameplan is the margin, not
the game.

## The core design sentence
Gameplan is **not** priced into `preseasonExpectedWins()`. Expectation assumes
Balanced + Base defense every week. Gameplanning is the in-season lever you
pull to *beat* expectation — this is how the "outplayed the money" score
becomes a skill expression rather than a luck readout. Say this in the UI:
"Expectation assumes a neutral gameplan. Out-coach it."

## Sim integration
- The combined modifier adjusts the pre-game win probability, then the game
  sims deterministically from `(seed, roster, gameplan)`.
- The modifier, the opponent tags, and both picks are written into the game log.

## Narration (decisions must be legible)
- **Pre-game matchup card:** show each pick's edge live as the player taps:
  "Blitz heavy vs their Air Raid — your edge (+5%)" (green) /
  "Ground & pound vs their 4-3 front — uphill (−3%)" (red), plus the net.
  Show opponent tags: "They run: Air Raid / 3-3-5".
- **Post-game one-liner** (dry, Bloomberg tone — never corny), keyed off
  (pick, edge sign, result): e.g. blitz + win → "The blitz got home — 5 sacks,
  2 turnovers."; blitz + loss vs power-run → "They ran it through the blitz —
  240 rushing yards."; neutral picks → no line (don't narrate nothing).
- **Season report:** a "Gameplan record" block, e.g. "When you blitzed: 4–2
  (+2.1 vs expected)". This is what makes 12 small decisions feel like one
  coaching performance.

## Payload & server replay (HARD RULE)
The publish payload must include `gameplan: [{ week, off, def }]` (and the
`autoGameplan` flag). Server replay applies the identical counter matrix from
the identical scheme-tag table. If replay can't reproduce the picks, the
verified leaderboard breaks — treat this as a blocking invariant, same as the
$30M math.

## Scheme tags as content
Tags also feed the storyline engine: "Rivalry week: their Air Raid against
your blitz packages." Keep the copy dry.

## UI details
- Week card: two labeled rows of three large buttons (min 56px touch targets),
  opponent tags visible above, net edge preview updating live.
- "Auto gameplan for the rest of the season" toggle on the week card.
- Season report and share page show the gameplan record block.

## Balance & verification
- `npx tsc --noEmit`, `npm run build`.
- **Determinism test:** same (seed, roster, gameplan) → byte-identical season,
  twice. Add to `scripts/test-season-mode.ts`.
- **Balance bound:** via `scripts/tune-playoff.ts`, perfect gameplanning across
  a season should be worth ~+0.5 to +1.0 wins vs neutral — same philosophy as
  program gravity. If the optimal pick is ever "always blitz," the matrix is
  wrong; every option must be the right answer somewhere.
- Publish one season with mixed gameplan picks; confirm the server replay
  reproduces it exactly and the share page shows the picks.

## Implementation decisions (September 24, 2026)
- The user confirmed that Bracket their WR1 uses Air Raid / Spread tags only until
  team-specific position-group evidence exists. Do not infer WR strength from
  the shared modeled budget split.
- The simulator has scores but no sacks, turnovers, or rushing-yard totals.
  Narration should describe the call, matchup, and result without invented stats.
- The score-based simulator converts the probability modifier into an expected
  margin change; the displayed odds and simulated scores remain aligned.
