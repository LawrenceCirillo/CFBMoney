# CFB Money — *What does it cost to win college football?*

A data product around college-football roster spending: where the money is,
who gets the most out of it, head-to-head comparisons, and a build-your-own-roster game.

## Quickstart

```bash
npm install
npm run validate-data # check all committed 2026 source snapshots
npm run build-data    # validated CSV + metadata -> public/data/cfb-2026.json
npm run dev          # http://localhost:3000
```

`npm run build` runs the data pipeline automatically via `prebuild`.

### Local verification

```bash
npm ci
npx playwright install chromium
npm run check
```

`npm run check` validates the source snapshots, rebuilds generated data, runs
TypeScript and the spend/season/DB/publish/availability tests, builds the app,
then runs Chromium Build navigation and a real local publish → share → leaderboard
smoke test. It finishes by failing if the committed generated JSON changed.
The browser test starts a local app; the share test starts a separate local app
and creates its own disposable database. Neither test publishes to production.
Use `npm run test:browser` or `npm run test:share` after `npm run build` to run
one of those checks separately.

On a machine that can run embedded Postgres as a non-root user, DB tests need
no configuration. CI uses a local Postgres service instead:

```bash
TEST_DATABASE_URL=postgresql://cfb_test:cfb_test@127.0.0.1:5432/cfb_test npm run check
```

In PowerShell, set `$env:TEST_DATABASE_URL` to that URL before running
`npm run check`.

`TEST_DATABASE_URL` must point to a local database named `cfb_test`. Each DB
test creates a uniquely named database on that service and drops it afterward.
`DATABASE_URL` is never used as the test target. The pull request and `main`
workflow runs this same gate with Node 22, PostgreSQL, and Chromium.

## How the data flows

```
data/
  teams.json                    # source of truth: slug, name, abbr, conference, color, espn_id
  athletic-nil-budgets-2026.csv # Athletic budget ranges (Sept 2026)
  ap-poll-2026.csv              # AP Top 25 by week; the latest week is the current ballot
  espn-fpi-sos-2026.json        # dated FPI schedule-strength ranks for 68 programs
  espn-scores-2026.json         # latest fully completed regular-season week
  espn-season-2026.json         # dated team totals and rosters
        |
        v  scripts/validate-data.mjs checks every source
        v  scripts/build-data.mjs derives spending metrics and caches logos
        |
public/data/cfb-2026.json       # generated, committed, imported by lib/data.ts
public/logos/{slug}.png         # ESPN dark NCAA marks, cached locally
```

Rules:

- **Source snapshots live in `data/`.** Budgets and the AP ballot are separate
  files so spend rank and poll rank cannot get mixed. Update AP and FPI from
  their published sources; the two ESPN fetch scripts write score and season
  snapshots only after coverage checks pass. Run the validator before building.
- **All derived metrics are computed in `scripts/build-data.mjs`**, not in components:
  midpoints, competition spend ranks, value gap vs the current AP ballot. When
  final win totals arrive, add a `results` source. Any ratio using those results
  and the current budget midpoints would still use estimated spending; reporting
  actual dollars per win requires a separate actual-spending source.
- The generated JSON is committed so deploys are deterministic.
- Unchanged inputs produce the same generated JSON. Source dates live on the
  individual snapshots; the generated file has no clock-based timestamp.

### Reading the estimates and model

The public `/methodology` page explains the current third-party budget ranges,
their midpoint and rank calculations, the dated AP and ESPN snapshots, and the
assumptions behind modeled expected wins. The ranges are estimates of 2026 roster
budgets, not verified school expenditures. Moneyball's dollars per expected win
uses those midpoints and a simulated common-opponent model; it does not use
observed 2026 wins. The page reads the budget source note and current AP/FPI
week and dates from committed generated data, so a reviewed refresh updates its
source labels without editing page copy.

An owned budget estimate model and an analysis of actual spending against final
results remain separate research projects. Neither is implied by publishing the
current methodology page.

### Reviewed weekly refresh

Keep this process human-reviewed during 2026. [AP Top 25](https://apnews.com/hub/ap-top-25-college-football-poll),
[ESPN FPI](https://www.espn.com/college-football/fpi),
[ESPN scoreboard](https://www.espn.com/college-football/scoreboard), and
[ESPN teams](https://www.espn.com/college-football/teams) are the sources.
The budget estimate file comes from [The Athletic](https://www.nytimes.com/athletic/interactive/college-football-nil-spending-budgets/)
and is not changed by a weekly sports-data refresh.

1. Confirm the latest AP poll is published. Add its 25 rows to
   `data/ap-poll-2026.csv`, update `# as_of:` and `# note:`, and verify names
   and ranks against the AP source. Do not infer or silently replace a ballot.
2. Capture current ESPN FPI played/remaining schedule-strength ranks in
   `data/espn-fpi-sos-2026.json`. Update its `as_of` and note, keep
   `season: 2026`, and retain one
   entry for every tracked ESPN team ID. This source is curated manually.
3. Run `npm run fetch:scores`. The script selects the most recent
   regular-season week whose ESPN calendar end has passed, reads scheduled
   events as well as finals, and refuses to overwrite the snapshot if a
   tracked event is unfinished or malformed. It reports final games,
   participating programs, and byes.
4. Run `npm run fetch:season`. It requires valid totals and rosters for all
   68 programs before writing and stamps the actual successful fetch date.
5. Run `npm run validate-data`, then `npm run build-data`. The validator
   checks all source coverage, dates, scores, rosters, and AP ranks. It reports
   normal publication skew between AP and ESPN dates.
6. Review `git diff -- data/ public/data/cfb-2026.json`: source dates,
   poll changes, score week/game/bye counts, roster changes, FPI coverage, and
   derived spending ranks. Cross-check byes and known games against the
   published ESPN schedule. Update the snapshot-date line below. Run `npm run test:spend`,
   `npx tsc --noEmit --incremental false`, and `npm run build`. Re-run
   `npm run build-data` and confirm the generated file has no further diff.
7. Merge and deploy only the reviewed snapshot. Check the public spending,
   team, and leaderboard pages after deploy. If ESPN changes its event shape
   or omits a known game, keep the last committed snapshot. If a bad snapshot
   is deployed, revert its data commit and redeploy the last known-good data.

The score snapshot is the latest completed week, while AP and ESPN may
publish on different days. A program with no scheduled event in that week is
a bye, not an incomplete fetch. Fetch dates use UTC. No automated weekly
publication is enabled.

Snapshot dates at this implementation: AP Week 3 published 2026-09-20; FPI
captured 2026-09-22; Week 3 scores and rosters fetched 2026-09-23. The score
fetch found 48 final games, 68 participating programs, and no byes.

## Project structure

```
app/
  page.tsx            # Spending — hero, metric switcher, storylines
  moneyball/page.tsx  # Spend-vs-rank scatterplot + value leaderboard
  methodology/page.tsx # Sources, calculations, model assumptions, and limits
  team/[slug]/page.tsx# Per-school financial profile (statically generated)
  compare/page.tsx    # Head-to-head (v0)
  build/page.tsx      # Roster builder game (v0)
components/           # Navbar, TeamBars, Scatterplot
lib/                  # types, data loader, formatting
scripts/build-data.mjs
```

## Leaderboard + shareable seasons (Postgres)

Publishing a finished season (`POST /api/seasons`) stores a server-replayed result
in Postgres and returns a share id. The request must include a UUID v4
`Idempotency-Key` header. The browser keeps one key and payload for retries of a
finished run; concurrent retries return the original share id. The route reads
at most 16 KiB of JSON and returns 413 for a larger body. Anyone opening
`/s/[id]` sees the full recap with an OG image for link previews;
`/leaderboard` ranks verified seasons by wins or wins-minus-expected. Seasons
published before server replay remain in the unranked archive.

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

The Vercel `cfb-money` project is linked to this repository's `main` branch.
Pushing to `main` starts a production deployment; the project framework preset
must be Next.js so Vercel serves the generated routes.

### Publish rate-limit rollout

The proposed Vercel Firewall rule matches **path exactly `/api/seasons`** AND
**method `POST`**. Use a fixed 60-second window, **10 requests per client IP**,
and a **log-only** follow-up action first. Inspect matching traffic and legitimate
publish volume in the Firewall dashboard before enforcement. The browser handles
the eventual 429 response with a wait-and-retry message; retries keep the same
idempotency key. Vercel tracks counters per region, so 10/min is a regional
threshold rather than a guaranteed global ceiling.

Rollout requires an operator review: publish the log-only rule, inspect live
matches, then scope 429 enforcement to a preview deployment and verify the
11th POST in one minute gets 429 while ordinary publishing works. Restore
production logging for review before enabling 429 in production. Watch 429 and
5xx rates after each change; return the rule to log-only if legitimate users
are affected. Do not log request bodies or raw client IPs in application logs.

Vercel [supports rate limiting on all plans](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting):
Hobby includes one rate rule and 1 million allowed requests monthly; Pro uses
usage-based pricing listed at $0.50 per million allowed requests. Confirm the
project's actual plan and current usage in Vercel before enforcement. WAF rules
are project settings, not part of the Git deployment.

Local dev alternative: run Postgres locally or in Docker and put its connection
string in `.env.local` as `DATABASE_URL`.

### DB scripts

```bash
npm run db:generate  # regenerate migrations after editing db/schema.ts
npm run db:migrate   # apply migrations via DATABASE_URL_UNPOOLED when set
npm run test:db      # isolated data-layer tests
```

`npm run test:db` exercises `createSeason` / `getSeason` / `getLeaderboard` /
`countSeasons` plus payload validation. It uses a fresh disposable database
through the local test service or embedded Postgres as described above.

## Roadmap

1. Research and validate an owned budget estimate model; the public methodology
   currently describes the third-party ranges used by the app.
2. Add a final-results source and a separately sourced actual-spending measure
   before reporting observed dollars per win or testing budget-vs-results relationships.
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
