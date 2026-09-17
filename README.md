# CFB MONEY

College football data site: **What does it cost to win?**

Power 4 + Notre Dame roster budgets (The Athletic), 2025 results, and CFBD/Knight-Newhouse context — built as a static Next.js site for Vercel.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Charts: `d3-scale` / `d3-array` (SVG in React)
- Data: `data/teams.json` + `data/meta.json` generated from CSV (no database)

## Rebuild data

Primary source CSV: `uploads/cfb-moneyball-portal.csv`

```bash
python3 scripts/build_dataset.py
```

This recomputes moneyball expected wins (`3.2659 + 0.1528 × budget_mid_m`) and writes JSON under `data/`.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Production build (runs the data script first):

```bash
npm run build
npm start
```

## Deploy to Vercel

1. Import the GitHub repository in Vercel.
2. Framework preset: **Next.js**
3. Build command: `npm run build` (default)
4. No environment variables required for V1.

Team pages use `generateStaticParams` for all 68 teams.

## Pages (V1)

| Route | Description |
|-------|-------------|
| `/` | Spend vs wins scatter, KPI strip |
| `/spending` | Roster budget leaderboard |
| `/moneyball` | $/win and WAE board + methodology |
| `/team/[slug]` | School profile |
| `/compare`, `/build` | Coming soon shells |

## Credits

See `data/meta.json` and site footer: **The Athletic**, **CollegeFootballData**, **Knight-Newhouse**, and public W-L sources documented in `uploads/moneyball-methodology.md`.
