# CFB Money — *What does it cost to win college football?*

A data product around college-football roster spending: where the money is,
who gets the most out of it, head-to-head comparisons, and a build-your-own-roster game.

## Quickstart

```bash
npm install
npm run build-data   # CSV + metadata -> public/data/cfb-2026.json
npm run dev          # http://localhost:3000
```

`npm run build` runs the data pipeline automatically via `prebuild`.

## How the data flows

```
data/
  teams.json                    # source of truth: slug, name, abbr, conference, color, espn_id
  athletic-nil-budgets-2026.csv # Athletic budget ranges (Sept 2026)
  ap-poll-2026.csv              # AP Top 25 by week; the latest week is the current ballot
        |
        v  scripts/build-data.mjs  (validates, derives, merges, caches logos)
        |
public/data/cfb-2026.json       # generated, committed, imported by lib/data.ts
public/logos/{slug}.png         # ESPN dark NCAA marks, cached locally
```

Rules:

- **Raw sources live in `data/`, never edited by hand after import.** Budgets and
  the AP ballot are separate files so spend rank and poll rank cannot get mixed.
  Replace a source and re-run `npm run build-data`. The UI never changes.
- **All derived metrics are computed in `scripts/build-data.mjs`**, not in components:
  midpoints, competition spend ranks, value gap vs the current AP ballot. When
  final win totals arrive, add a `results` source and compute $/win + expected-wins
  regression in the same script.
- The generated JSON is committed so deploys are deterministic.

## Project structure

```
app/
  page.tsx            # Spending — hero, metric switcher, storylines
  moneyball/page.tsx  # Spend-vs-rank scatterplot + value leaderboard
  team/[slug]/page.tsx# Per-school financial profile (statically generated)
  compare/page.tsx    # Head-to-head (v0)
  build/page.tsx      # Roster builder game (v0)
components/           # Navbar, TeamBars, Scatterplot
lib/                  # types, data loader, formatting
scripts/build-data.mjs
```

## Leaderboard + shareable seasons (Postgres)

Publishing a finished season (`POST /api/seasons`) stores it in Postgres and
returns a share id. Anyone opening `/s/[id]` sees the full recap with an OG
image for link previews; `/leaderboard` ranks all published seasons by wins or
by wins-minus-expected.

The data layer (`db/`) uses Drizzle ORM against any Postgres. Without
`DATABASE_URL` the app still builds and runs — publishing is disabled and the
leaderboard/share pages explain how to connect.

### Setup (Neon)

1. Create or select a Neon database and copy both connection strings: the pooled
   URL (`-pooler` in the hostname) and the direct URL.
2. Put them in the git-ignored `.env.local` as `DATABASE_URL` (pooled, for app
   traffic) and `DATABASE_URL_UNPOOLED` (direct, for migrations).
3. Run `npm run db:migrate`. Drizzle Kit loads `.env.local` and uses the direct
   URL. If the migration has already been applied, no schema change is needed.
4. Set `DATABASE_URL` to the pooled URL in the deployed app's server-side
   environment, redeploy, then publish one completed season and open its recap
   and leaderboard entry.

Local dev alternative: run Postgres locally or in Docker and put its connection
string in `.env.local` as `DATABASE_URL`.

### DB scripts

```bash
npm run db:generate  # regenerate migrations after editing db/schema.ts
npm run db:migrate   # apply migrations via DATABASE_URL_UNPOOLED when set
npm run test:db      # end-to-end data-layer tests (needs TEST_DATABASE_URL or non-root)
```

`npm run test:db` exercises `createSeason` / `getSeason` / `getLeaderboard` /
`countSeasons` plus payload validation. With `TEST_DATABASE_URL` set it tests
against that server; otherwise it boots an embedded Postgres (cannot run as root).

## Roadmap

1. Swap Athletic estimates for your own model (methodology page).
2. Add `results` data source -> $/win, expected-wins regression, true Moneyball.
3. Build game: ~~outcome simulation~~ ✅ done (see below), ~~shareable season cards~~ ✅
   `/s/[id]` + OG images, ~~leaderboard~~ ✅ Postgres-backed (`/leaderboard`).
4. Compare: shareable `/compare/[a]-vs-[b]` URLs + OG images.

## Season simulator (`lib/simulator.ts`)

Pure-function engine, no React. Dollars → talent via diminishing-returns curves
(`talent = floor + (1-floor)·spend/(spend+c)` — first million matters most),
talent → OFF/DEF/ST ratings (0–100) via position weights, opponents rated with
the same formula from their estimated budgets. Games: expected score from rating
gaps + home edge, win probability from the historical margin spread, scores with
matching noise, OT for ties. Calibrated via `node scripts/calibrate.mjs`:
win-prob ↔ simulated upset rate agree, ~$30M ≈ 6–7 wins, $51.5M ≈ 9–11.
