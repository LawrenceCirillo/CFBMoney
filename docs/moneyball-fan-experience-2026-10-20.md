# Moneyball fan experience — October 20, 2026

## Before implementation: evidence and reference lock

Live production was rechecked after PR #18: three equal spotlight cards, process
copy before them, provenance between cards and chart, no unranked-spender section,
no AP-proxy cost, and no row gaps/cost per win. The schedule spotlight already
leads with AP versus spend rank; keep that money-first ordering.

Build target: the existing CFB Money page and design system, with the user's
ten-item fan-experience brief controlling content and hierarchy. Preserve Archivo,
light/dark tokens, team marks, dated data, saved movement, accessible tooltips,
the horizontal touch chart, and the model slider. No new assets or client data fetch.

Refero styles researched across editorial, sports/data and Glassnode queries:
Glassnode (https://glassnode.com; style 8e14f3d6-c248-4a13-9c42-577457d2920b)
and 19–86 (https://19-86.fr; style 7a8c99db-5ce7-4fa4-b491-8f1fcac18991).
These are narrow reference ingredients, not replacement brand systems.

| Decision | Source | Role and implementation |
| --- | --- | --- |
| Dominant, signed hero gap | User item 1; 19–86's number as focal point | Large tabular number, existing display face; all tied leaders retained |
| Restrained supporting statistics | Existing CFB Money; Glassnode's compact analytics hierarchy | Existing panel/line/paper/fog tokens, no decorative color or shadows |
| Cards directly into chart | User items 7–9 | Move selection rules and full provenance to methodology; short computed update stamp at top |
| Complete money story | User items 2–6 | Current inputs drive cheapest ranked budget, unranked top spenders, AP proxy, gaps and cost per win |
| Context follows each crude cost | User item 6 | Reusable server-rendered label includes budget midpoint and partial-season caveat |

## Data definitions

- Rank gap remains spend rank minus AP rank. All tied largest positive gaps are
  featured; the existing negative and other-schedule selectors remain intact.
- Top-10 spender means spend rank <= 10, including competition ties.
- Records come from the existing repository ESPN season snapshot, which currently
  covers all 68 programs. Missing or malformed records fail rather than becoming
  invented zeroes. Cost per win is budget midpoint divided by recorded wins; zero
  wins has no dollar figure.
- Cheapest ranked teams are selected by budget midpoint; ties are retained.
- The AP proxy uses the full saved national ballot at ranks <= 12, with ties
  included and its actual team count shown. It is not a CFP bracket. A future
  untracked team remains in the field; a missing budget makes the full cost
  unavailable, never a falsely complete subtotal.
- Show AP #13 for contrast when its known midpoint exceeds at least half the
  field's known midpoints, and state the exact comparison count. Missing field
  budgets disable this comparison. Equal budgets do not count as outspent.
- The short update stamp uses the latest poll/record/SOS source date, never the
  local clock. The full separate dates remain in methodology.

## Verification

- Final `npm run check`: passed, exit 0. TypeScript, production build, all
  simulator/gameplan/gravity checks, isolated database/publish/share tests and
  generated-data drift checks passed. Log:
  `C:/Users/ljcir/AppData/Local/Temp/cfb-moneyball-fan-2026-10-20-check-final.log`.
- Browser suite: 46/46 passed, including all previous Moneyball polish checks,
  current hero selection, per-row signed gaps and qualified cost, section records,
  AP-proxy arithmetic, copy placement, dark-mode 320/390px layout and the existing
  light-mode horizontal touch-chart checks. These are browser emulation, not a
  physical phone review.
- Payroll pilot fixtures: 300/300 exact; production payroll generation validates
  all 68 team sums. Source snapshots and generated payrolls have no content diff.
- New pure calculation tests cover changed snapshots, tied hero/cheapest teams,
  competition ties among top spenders, no qualifying unranked spenders, missing
  records, zero wins (including no rendered dollar figure), missing proxy budgets,
  cutoff ties and the exact first-out comparison.
- Current snapshot sanity checks: Houston +47; Arizona is the cheapest tracked
  ranked midpoint; Oregon 4-2 and Texas A&M 4-3 are the two unranked top spenders;
  AP proxy $432.5M; #13 Alabama's $40M midpoint exceeds six of twelve field books.
- Desktop visual pass: 1280x720 in light/dark, checked against the reference lock.
  The lead number dominates the first viewport; secondary cards retain money-first
  ordering. Browse gaps, cost caveats, the unranked section and AP-proxy field are
  legible. No page overflow or console errors observed. Corrected methodology
  phrase and selection-rules paragraph each occur exactly once.
- React review: new presentation stays on the server; no new client fetches,
  effects or storage. Existing chart/slider client boundaries and payloads stay
  unchanged. New record/gap/cost accessible names retain the descriptive caveat.
- The initial full run had one intermittent pre-existing 320px dark Build overflow
  assertion immediately after reload. All 16 Build tests passed on a separate
  rerun, and all 46 passed in the final complete gate. Builder code was not changed.
- SIM_VERSION remains 4; model, budget, gravity and schedule inputs/code have no
  diff. No database migration or production write was needed.
- Preview: http://127.0.0.1:3013/moneyball. Implementation remains on
  `codex/022-moneyball-fan-experience`; no commit or production release made.
