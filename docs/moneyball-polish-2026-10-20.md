# Moneyball polish — October 20, 2026

## Re-check before edits

Production remained on Week 8: AP October 18, records/SOS October 19, 24
tracked ranked teams. The rendered methodology contained `68tracked`.
The swipe hint and browse list were already hidden at the 1280px desktop
viewport; the hint still depended only on width. The chart had basic native
SVG titles without spend rank or weekly movement. Kentucky's observation
led with SOS; Houston and Texas led with AP versus spend rank. Boise State
held national #21 outside the tracked budget set. Spend ranks use competition
ties, but the page did not explain them.

## Reference lock and decisions

Primary target: the existing CFB Money page and the user's seven-item brief.
Preserve Archivo typography, section order, compact cards, existing light/dark
tokens, all chart logos/team links, neutral interpretation and dated sources.
Refero references reviewed: Glassnode (https://glassnode.com), for compact
data captions and clear chart context; Linear changelog
(https://linear.app/changelog), for restrained contextual surfaces. Borrow only
their compact label hierarchy and contained surface treatment. No external
palette, typography, imagery or page redesign is introduced.

| Decision | Evidence | Implementation |
| --- | --- | --- |
| Consistent spotlight lead | User brief, existing card structure | AP versus spend paragraph first in every card; same definitions follow |
| Browse list on desktop and mobile | User movement requirement, existing mobile list | Same links, compact responsive columns, saved AP/spend movement on every row |
| Honest comparisons | Saved Week 7 CSV and actual production book | No session state, invented #26, or reconstructed historical ranks |
| Contextual logo details | User tooltip request; compact reference captions | One theme-token tooltip on hover/focus; Escape dismisses; links keep normal navigation |
| Touch-only swipe copy | Existing 880px touch chart | Narrow coarse-pointer/no-hover media query; scrolling dimensions retained |

## Data provenance

`data/spend-rank-history-2026.json` archives all 68 Week 7 books from production
commit `5fa521215ff9af68dc621f2af75584f675db56ee`, captured October 15; that
snapshot explicitly dated its AP poll October 11. AP ballots come from the
existing CSV. The new generated artifact validates saved ballots (including
real competition ties), retains national untracked teams, and compares the
greatest saved predecessor. The current comparison is Week 7 to Week 8.

Texas is down 12 AP places, Houston/BYU are up six, and Florida/Arizona are
new entries. All spend movements are zero because the stored September
budget books are unchanged. These are rank movements, not judgments about
financial return. Future missing spend baselines display unavailable and
must not be substituted with the current book.

## Verification

- `npm run check`: passed, exit 0. TypeScript, production build, saved-history
  validation, spending/methodology tests, season/gameplan/gravity determinism,
  build recovery/preview, isolated database/API/share checks and generated drift
  all passed.
- Browser suite: 41/41 passed. New coverage checks corrected copy exactly once,
  desktop hint hiding at 720/1280px, untracked AP rank explanation, consistent
  spotlight order, all 24 teams' saved movements, all logo tooltips in light/dark,
  hoverable contents, Escape, focus/navigation and touch scrolling at 320/390px.
- Payroll fixtures remain 300/300 exact; all 68 production payroll sums pass.
- Desktop visual pass: 1280x720, light and dark, against the existing page target.
  All 24 browse ranks remain on one line; native browser DOM reads confirm one
  corrected methodology phrase and zero `68tracked` occurrences. Tooltips and
  the $10M slider were also exercised on the local production build.
- The mobile checks above are browser emulation, not a physical-phone review.
- Model version 4 and fingerprint `v4-660333c47c4c5130` remain unchanged.
  Original AP rows, current cfb-2026.json, budgets, season/roster data, payrolls
  and simulator/replay code have no diff.
- Local preview: http://127.0.0.1:3012/moneyball. No production release was made.
