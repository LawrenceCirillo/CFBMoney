# Moneyball chart design — October 20, 2026

## Recheck and reference lock

Production after PR #19 still has no parity path, 12px/400 scatter tick labels,
and the same visible caveat in all 24 browse cells. Every colored rank gap has
a sign and every colored movement has AP up/down text. The model curve also has
non-color redundancy: dashed comparison segment, outlined starting marker,
filled ending marker, textual budgets/wins and an accessible chart description.
The green Play action has its explicit text. No color-only meaning was found.

Build target: the existing CFB Money UI and the user's five-item design brief.
Keep Archivo, display numerals, the hero and section order, restrained theme
tokens, rank colors, white circular chart mark backings and existing tooltips.
Reuse the prior Refero research rather than introducing a competing visual system:
Glassnode (https://glassnode.com, style 8e14f3d6-c248-4a13-9c42-577457d2920b)
for quiet analytical annotations; 19–86 (https://19-86.fr, style
7a8c99db-5ce7-4fa4-b491-8f1fcac18991) only for compact ruled ladder rows.

| Decision | Source | Role |
| --- | --- | --- |
| Faint neutral parity path behind marks | User item 1; existing chart tokens | Exact (budget midpoint, spend rank) vertices in budget order; no new color |
| Complete, linear rank scale | Current spend ranks reach #64 | Expand past AP #25 so large gaps and their baseline are visible; no clipped baseline or broken/log scale |
| Shared browse qualification | User item 2 | One visible note above the grid, announced as section context; standalone card caveats unchanged |
| Preserve redundant colored cues | User item 3; live DOM audit | Keep all signs and AP up/down wording, change no status color |
| Tick typography | User item 4 | 14px/500 with tabular numerals, same theme text token |
| AP-proxy ladder | Optional item 5 | Ruled rank/logo/team/midpoint rows; same field, total and first-out calculation |

## Parity semantics

The existing AP-only range stops at #26, but current charted spend ranks reach #64.
The chart therefore needs a shared linear rank domain containing both measures;
plot height increases modestly to keep marks legible. Equal budget/spend-rank
ties occupy one identical parity vertex, so they introduce no false vertical gap.
Competition rank jumps remain in the connected line. All logo coordinates use
the same linear rank transform as the line. In particular, each team's vertical
separation is proportional to spend rank minus AP rank, including Houston's +47.
The line has no pointer events and is behind the unchanged white circular marks.

## Verification

- `npm run check`: passed, exit 0. TypeScript, optimized production build,
  simulator/gameplan/gravity, isolated database/publish/share checks and generated
  artifact checks all pass. Log:
  `C:/Users/ljcir/AppData/Local/Temp/cfb-moneyball-chart-2026-10-20-check.log`.
- Browser suite: 50/50 passed. New cases verify layer order, non-interactive line,
  white circular mark fills, tick size/weight/tabular numerals, non-overlapping
  image bounds and working hover for Texas Tech/Ole Miss/Tennessee/Alabama in
  both themes. Existing keyboard/Escape/navigation tests still pass for all logos.
- Touch-chart checks now run at 320/390px in both light and dark: the full-size
  horizontal chart, visible parity path/caption and document width pass. This is
  browser emulation; a physical-phone review remains Lawrence's follow-up.
- Calculation checks confirm global spend ranks rather than subset ranks, a full
  linear domain, proportional vertical gaps, shared tie vertices, deterministic
  order and unchanged spend reference when AP positions move. The current chart
  has 22 distinct parity vertices for 24 ranked teams and a #70 domain containing
  the maximum plotted spend rank #64; its viewBox is 880 x 760.
- The browse region contains exactly one visible caveat and none in its cells.
  Its accessible description points to the shared note; individual links keep
  their cost figure. Spotlight/unranked card caveats and full methodology remain.
- Color audit passes in both themes: every colored rank signal has its sign or
  AP up/down wording. No palette or status-class change was needed.
- Optional ladder is complete: 12 rows, correct ranks/logos/team links/midpoints,
  unchanged $432.5M total and Alabama's six-of-twelve contrast note.
- Desktop visual pass on the local production build: 1280x720 light/dark, checking
  the dense cluster, line/caption, tick hierarchy, browse grid and ladder. No
  unresolved overlap or theme issue observed. Existing white circular chart
  backings, hero typography and section order are preserved.
- Payroll fixtures remain 300/300 exact. SIM_VERSION remains 4; budgets, saved
  AP/season/history inputs, payrolls and all simulator/replay code are unchanged.
- React review: geometry stays pure and deterministic; no new effect, dependency,
  client fetch or data serialization. The reference line cannot intercept input.
- Preview: http://127.0.0.1:3014/moneyball. Work is on
  `codex/023-moneyball-chart-design`; no commit or production release made.
