# CFBD × Athletic Moneyball Join

**As of:** Sept 16, 2026
**API:** CollegeFootballData.com (Bearer key from box secrets)
**Base:** `/workspace/cfb-money/cfb-moneyball-joined.csv` (Athletic 2026 budgets + 2025/2026 W-L + Moneyball)
**Output:** `/workspace/cfb-money/cfb-moneyball-cfbd.csv`

## Endpoints & years
- `GET /recruiting/teams` — 2022–2026
- `GET /ratings/sp` — 2025, 2026
- `GET /ratings/fpi` — 2025, 2026
- `GET /draft/picks` — 2024–2026 (aggregated to school counts + R1)

## Match rate (of 68 Athletic teams)
- Recruit rank 2025: 68/68
- SP+ 2025: 68/68
- FPI 2025: 68/68
- SP+ 2026: 68/68
- FPI 2026: 68/68
- Unmatched: none

## Correlations (68-team sample)
- budget_mid vs SP+ 2025: **0.6**
- budget_mid vs FPI 2025: **0.691**
- budget_mid vs recruit points 2025: **0.802**
- wins_above_expected vs recruit points 2025: **-0.059**

## Highest budget $M per 2025 recruit point (spendy relative to HS talent)
| Team | Mid $M | Recruit pts | $/pt | Recruit # | SP+ # | WAE |
|---|---:|---:|---:|---:|---:|---:|
| Texas Tech | 40.0 | 201.51 | 0.1985 | 48 | 3 | 2.62 |
| Indiana | 38.0 | 201.75 | 0.1884 | 47 | 1 | 6.926 |
| Miami | 47.0 | 257.66 | 0.1824 | 13 | 9 | 2.55 |
| Ohio State | 51.5 | 297.72 | 0.173 | 4 | 2 | 0.863 |
| LSU | 48.5 | 281.53 | 0.1723 | 10 | 32 | -3.679 |
| Oregon | 51.0 | 296.1 | 0.1722 | 5 | 4 | 1.939 |
| Texas A&M | 47.5 | 282.42 | 0.1682 | 9 | 9 | 0.474 |
| Ole Miss | 42.0 | 251.63 | 0.1669 | 16 | 7 | 3.315 |
| Notre Dame | 44.5 | 270.22 | 0.1647 | 12 | 5 | -0.068 |
| Texas | 50.0 | 312.27 | 0.1601 | 1 | 17 | -0.908 |

## Lowest budget $M per 2025 recruit point (efficient talent acquisition)
| Team | Mid $M | Recruit pts | $/pt | Recruit # | SP+ # | WAE |
|---|---:|---:|---:|---:|---:|---:|
| Boston College | 10.5 | 195.09 | 0.0538 | 59 | 97 | -2.871 |
| Duke | 13.5 | 220.94 | 0.0611 | 30 | 44 | 3.671 |
| Iowa State | 15.0 | 197.45 | 0.076 | 54 | 33 | 2.441 |
| Arizona | 15.5 | 200.65 | 0.0772 | 50 | 28 | 3.365 |
| Cincinnati | 15.0 | 189.52 | 0.0791 | 61 | 56 | 1.441 |
| Houston | 17.0 | 198.73 | 0.0855 | 52 | 40 | 4.136 |
| Oklahoma St. | 17.0 | 198.62 | 0.0856 | 53 | 121 | -4.864 |
| Kansas | 16.0 | 178.35 | 0.0897 | 72 | 58 | -0.711 |
| Pitt | 18.0 | 199.28 | 0.0903 | 51 | 36 | 1.983 |
| Iowa | 19.0 | 208.27 | 0.0912 | 38 | 12 | 2.83 |

## Flagged programs
| Team | Mid $M | Rec #25 | Rec pts | SP+ | SP# | FPI | FPI# | Draft25 | R1 | WAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Indiana | 38.0 | 47 | 201.75 | 32.4 | 1 | 31.487 | 1 | 2 | 0 | 6.926 |
| Georgia | 32.5 | 2 | 304.64 | 24.1 | 6 | 21.443 | 7 | 13 | 3 | 3.767 |
| Texas | 50.0 | 1 | 312.27 | 16.2 | 17 | 18.576 | 11 | 12 | 3 | -0.908 |
| Ohio State | 51.5 | 4 | 297.72 | 30.1 | 2 | 27.617 | 2 | 14 | 4 | 0.863 |
| Oregon | 51.0 | 5 | 296.1 | 25.9 | 4 | 23.872 | 4 | 10 | 2 | 1.939 |
| Miami | 47.0 | 13 | 257.66 | 20.7 | 9 | 22.396 | 5 | 7 | 1 | 2.55 |
| Iowa State | 15.0 | 54 | 197.45 | 9.9 | 33 | 8.627 | 33 | 4 | 0 | 2.441 |
| BYU | 22.5 | 55 | 197.17 | 15.9 | 18 | 15.333 | 17 | 0 | 0 | 5.295 |

## Notes
- Recruiting is **high-school class** talent (247 Composite via CFBD), not portal. Portal-heavy winners (e.g. Indiana) can look “under-recruited” on this axis while still stacking roster spend.
- Draft year Y is NFL Draft following season Y-1 (CFBD convention: 2025 draft ≈ 2024 CFB season talent leaving).
- Name map: Mississippi St.→Mississippi State, Michigan St.→Michigan State, Oklahoma St.→Oklahoma State, Pitt→Pittsburgh.
- Key stored in box-secrets `card.CFBD_API_KEY`; never written to workspace files.
