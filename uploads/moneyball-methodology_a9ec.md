# CFB Moneyball Methodology

**As of:** September 16, 2026 (ET)  
**Sample:** 68 Power 4 + Notre Dame teams with Athletic NIL roster-budget estimates for assembling the 2026 roster.

## Data sources

| Dataset | Source | URL / file |
|---|---|---|
| 2026 NIL roster budgets (ranges, midpoints) | The Athletic (Sept 16, 2026) | `/workspace/cfb-money/athletic-nil-budgets-2026.csv` |
| 2025 final W-L (overall + conference) | Football Database FBS standings 2025 (cross-checked vs NCAA Conference Standings PDF) | https://www.footballdb.com/college-football/standings.html?yr=2025 |
| 2025 official conference standings (validation) | NCAA Football Conference Standings and Champions PDF | http://fs.ncaa.org.s3.amazonaws.com/Docs/stats/football_records/Standings.pdf |
| 2026 W-L (early season, ~Week 2–3) | Football Database FBS standings 2026 | https://www.footballdb.com/college-football/standings.html?yr=2026 |

Sports-Reference CFB and ESPN standings pages were attempted but blocked by bot/WAF challenges from this environment; Football Database provided complete public tables that matched NCAA final 2025 records for the Power 4 + Notre Dame sample.

Raw scrapes saved under `/workspace/cfb-money/raw/`.

## Team-name normalization

Athletic CSV names are authoritative. Football Database names mapped as:

- Mississippi → Ole Miss  
- Mississippi State → Mississippi St.  
- Michigan State → Michigan St.  
- Oklahoma State → Oklahoma St.  
- Pittsburgh → Pitt  
- (all other names matched 1:1, including NC State, Iowa State, Arizona State, etc.)

Notre Dame conference W-L left blank (Independent).

## Primary model: linear regression residual

Fit ordinary least squares across all 68 teams:

```
wins_2025 = 3.2659 + 0.1528 × budget_mid_m
```

- **Slope:** 0.1528 wins per $1M of mid budget (~1.53 wins per $10M)  
- **Intercept:** 3.2659  
- **R²:** 0.2268  
- **Mean budget_mid:** $27.22M  
- **Mean 2025 wins:** 7.426

Then:

- `expected_wins_2025` = predicted value from the model  
- `wins_above_expected_2025` = `wins_2025` − `expected_wins_2025` (**primary moneyball residual**)

A log-budget alternative was also fit for comparison:

```
wins_2025 = -5.7984 + 4.0839 × ln(budget_mid_m)
```

- **Log-model R²:** 0.2008 (weaker than linear; linear retained as primary)

Interpretation: with R² ≈ 0.23, budget midpoints explain only a modest share of 2025 win variance. Residuals are informative but noisy — coaching, schedule, health, and roster construction quality matter a lot beyond spend.

## Alternative: peer-budget expected wins

For each team, take other teams whose `budget_mid_m` is within **±$3M**. If fewer than 8 peers fall in that band, use the **nearest 8** teams by absolute budget distance instead.

- `peer_expected_wins_2025` = average 2025 wins of those peers  
- `peer_wins_above_expected_2025` = actual − peer expected  

Peer metrics are computed in `/workspace/cfb-money/raw/joined-extended.json` (not duplicated as CSV columns; primary residual remains the regression).

## Dollars per win

- `dollars_per_win_2025_mid_m` = `budget_mid_m / wins_2025` (blank if 0 wins)  
- `dollars_per_win_2026_mid_m` = `budget_mid_m / wins_2026` (**early-season only**; most teams have 0–3 games)

Lower $/win is “better” efficiency **only** among teams with enough wins; we flag &lt;8-win teams separately in the leaders file.

## Important caveats

1. **Roster-year mismatch:** Athletic budgets estimate cost to assemble the **2026** roster; we pair them with **2025** win totals for the moneyball residual. That is imperfect (different roster, different year).  
2. **2026 season incomplete:** 2026 W-L are mid-September snapshots (~2 games for most teams); $/win_2026 is illustrative only.  
3. **Athletic estimates are not audited** payrolls; ranges vary widely by program.  
4. **Postseason included** in 2025 overall W-L (CFP/bowl games), so Indiana’s 16–0 includes playoff wins.  
5. **Conference strength / SOS** not modeled — a win in the SEC ≠ a win in a weaker slate for residual purposes.

## Output files

- `/workspace/cfb-money/cfb-moneyball-joined.csv` — joined metrics (68 teams)  
- `/workspace/cfb-money/moneyball-leaders.md` — leaderboards  
- `/workspace/cfb-money/moneyball-methodology.md` — this file  
