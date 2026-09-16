# Portal talent join (CFB MONEY)

**As of:** Sept 16, 2026 (ET)  
**Primary source:** CollegeFootballData.com `GET /player/portal` (2025 & 2026), aggregated by destination team.  
**Joined file:** `/workspace/cfb-money/cfb-moneyball-portal.csv`  
**On3 / 247Sports official team ranks:** scrape in progress for cross-check (proprietary; license before production scrape).

## Match rate
- Athletic P4+ND teams with 2025 portal destinations: **68/68**
- Athletic P4+ND teams with 2026 portal destinations: **68/68**

## Metrics added
Per year (2025, 2026):
- `transfers_in`, `avg_rating`, `star_points` (5×5★+4×4★+…), `stars_4`, `stars_5`
- national CFBD ranks by avg rating / star points / volume
- `portal_{year}_rank_in_p4` — star-points rank within the 68-team set
- `portal_vs_hs_rank_gap_2025` — HS recruit rank − portal P4 star-points rank (higher = portal-heavier vs HS class)

## How to read this (important)
**Star-points / volume rankings reward quantity of 3★ transfers** (rebuild churn).  
**Avg rating + 4★/5★ counts** better capture "bought a contender" portal classes.

### 2025 quality leaders (avg rating, ≥8 transfers in)
Oregon, LSU, Miami, Texas Tech, Ohio State, Georgia, Texas A&M, Texas…

### 2025 elite portal haul (4★+5★ count)
LSU 11, Texas Tech 9, Oregon/Miami/Ole Miss/FSU 8…

### 2025 volume leaders (star-points) — often rebuilds
West Virginia, Purdue, North Carolina, Oklahoma St., UCF…

## Flagged programs
| Team | Roster mid | HS #25 | Portal 2025 | Story |
|---|---:|---:|---|---|
| Indiana | $38M | 47 | 23 in, avg 0.864, 2×4★ (incl. Mendoza) | Selective portal + spend; not a volume leader |
| Texas Tech | $40M | 48 | 21 in, avg 0.888, **9×4★** | High-spend + high-quality portal |
| Oregon | $51M | 5 | 11 in, **avg 0.903**, 8×4★ | Elite portal efficiency (few, expensive) |
| Georgia | $32.5M | 2 | 10 in, avg 0.884 | Still HS-first; light portal |
| Purdue / OkSt | low $ | weak HS | huge volume portal | Volume ≠ wins (both negative WAE 2025) |
| LSU 2026 | $48.5M | 10 | 44 in, 15×4★ + 3×5★ | Aggressive 2026 portal reload |

## Product use
- Moneyball / Compare: show **portal quality** (avg rating, elite count) beside Athletic spend and HS recruiting.
- Label clearly: CFBD portal ratings ≠ On3 Index / 247 transfer points until those are licensed.
- Volume portal without wins = "spend/churn without ROI" storyline.

## Files
- `/workspace/cfb-money/raw/portal/cfbd_portal_players_{2025,2026}.json`
- `/workspace/cfb-money/raw/portal/cfbd_portal_teams_{2025,2026}.csv`
- `/workspace/cfb-money/cfb-moneyball-portal.csv`

## On3 / 247Sports official 2026 team ranks (cross-check)

Scraped 2026-09-16. Joined into `cfb-moneyball-portal.csv`.

- On3: 68 rows (P4-scale table), Index Score + in/out ratings — Indiana #1, LSU #2, Texas A&M #3, Arkansas #4, Texas Tech #5
- 247: 212 rows; among P4 — LSU #1, Ole Miss #2, Texas #3, Penn State #4, Miami #5, Texas Tech #6, Ohio State #7, Indiana #8

**Read:** On3 Index rewards net roster improvement (Indiana #1 with only 17 ins / high avg). 247 points weight commit quality+quantity (LSU #1 with 44 commits). CFBD volume star-points alone overrated churn; official ranks align better with “contender portal” intuition.

**License:** On3/247 are proprietary — fine for internal research; production display needs license or stick to CFBD aggregates + attribution.
