# 68-Team Valuation Pipeline — Build Spec

## Goal
Compute a per-player NIL payroll for all 68 teams. Every player gets a valuation;
each team sums **exactly** to its budget. This is the data layer that unlocks
team-page payroll views and, later, the real-player pack/reveal pools.

## The method is locked — do not tune it
Full rationale: `player-valuation-methodology.md`. Implement exactly this:

- **Position weights:** QB 10 (designated QB1 only), backup QB 4, WR 4, DE 4,
  OL 3, DL 3, DB 2.5, LB 2.5, RB 2.5, TE 1.5, K 1, P 1, LS 0.5.
- **Label normalization (before weighting):** CB→DB, S→DB, DT→DL,
  EDGE→DE, OT→OL, FB→RB, C→OL, PR→WR.
  Team pages use inconsistent labels; normalize first. Any other unknown
  position label fails the run loudly — never guess.
- **Class multipliers:** SR 1.4, JR 1.15, SO 1.0, FR 0.7. Unknown class label
  fails the run loudly.
- **QB1:** exactly one per team, ×1.75 multiplier, from `qb1-designations.csv`
  (provided separately). Strip terminal Jr/Sr/II/III/IV suffixes from both names
  before matching. Require one unique roster match; do not guess nicknames.
- **Anchors:** pinned at exact value. Only from verified On3 current-model
  figures (post-2026-07-01 deal-based model) or reported deals with a source URL.
  Automated On3 matching: same team and one unique name match after stripping
  terminal generational suffixes. Anything ambiguous or flagged goes to a
  human review queue — never auto-pin a fuzzy match.
- **Modeled players:** `units / total_units × (budget − anchor_sum)`,
  where `units = position_weight × class_multiplier (× 1.75 if QB1)`.
  Round to nearest $1K. Apply $25K floor.
- **Exact-sum correction:** after rounding/flooring, add the residual to the
  largest modeled value so the team sums EXACTLY to budget. Verify with an
  assertion per team.
- **Fail the run if:** anchors ≥ budget; any player below the $25K floor after
  correction; any team sum ≠ budget; unknown position/class label; QB1 missing
  from roster.

## Inputs (read from this repo — do not scrape the live site)
- Rosters: the repo's own roster data backing `/team/[slug]` (name, position,
  class, jersey). ESPN normally supplies 100 players per team; exact duplicate
  removal and five verified QB additions make some rosters 99 or 101 players.
  Count is not a validation rule. If rosters don't exist as repo data, stop and
  say so instead of scraping.
- Verified roster supplements: `data/payroll-inputs/roster-additions.csv`,
  applied by the ESPN snapshot importer only while ESPN omits those players.
- Budgets: `cfb-2026.json` `budget_mid_m` — the exact figure, not the range.
- `qb1-designations.csv`: `team_slug,qb1_name` (provided separately).
- `anchors.csv`: `team_slug,name,value,source,source_url` (provided; seed it with
  the pilot anchors).

## Outputs
- `data/payrolls/<slug>.json` (or a single `payrolls.json`): every player with
  `valuation` (integer dollars; modeled already rounded to $1K) and `source`
  (`anchor:on3` / `anchor:reported` / `model`). Keep each team's original
  position labels in the output alongside the normalized ones.
- A verification report: per-team sum check, anchor count, floor hits, QB1
  confirmation. Print it; don't hide it in a log file.

## Fixtures — your implementation must reproduce these exactly
`iowa-payroll-pilot.csv`, `boston-college-payroll-pilot.csv`,
`ohio-state-payroll-pilot.csv` (pilot outputs, provided). Copy them into the
repo as fixtures. Any deviation between your pipeline's output on these three
teams and the fixtures is a bug. (Reference implementation that produced them:
`run-payroll-pilot.py`.)

The pilots test the historical calculation inputs: Ohio State used a $60M
pilot budget and two pilot anchors remain unverified. Production uses each
team's current `budget_mid_m` and leaves flagged anchors unpinned.

## Display rule (for whoever builds the payroll view, not this pipeline)
Anchors render exact; modeled values render rounded (~$0.9M style). Rounding
happens at render time, not in this data.

## Out of scope
Payroll UI, pack-mode pools and bands, On3 refresh automation (monthly, manual
for now), card attributes.
