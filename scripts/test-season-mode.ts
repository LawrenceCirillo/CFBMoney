/**
 * Deterministic tests for season mode (lite): storylines, projected rank,
 * postseason scheduling, outcomes, and full headless season runs whose
 * canonical replay parity and publish-input validation.
 *
 * Run with: npx tsx scripts/test-season-mode.ts
 */
import { data } from "../lib/data";
import type { TeamBudget } from "../lib/types";
import {
  mulberry32,
  optimalAllocation,
  cappedOptimalAllocation,
  allocationFromPlaysheet,
  clampGameBudget,
  clampPlaysheetToBudget,
  distributeAllocationToSlots,
  emptyAllocation,
  emptyPlaysheet,
  expectedScore,
  gameVenue,
  GAME_BUDGET_MAX_M,
  GAME_BUDGET_M,
  GAME_BUDGET_MIN_M,
  MARKET_CAPS,
  MARKET_HEADROOM_M,
  PLAYSHEET_SLOTS,
  POSITION_GROUPS,
  ratingsFromAllocation,
  setPlaysheetPosition,
  simulateGame,
  summarizeSeason,
  withDepth,
  type Allocation,
  type Ratings,
  type ScheduledGame,
} from "../lib/simulator";
import { expectedWins as modeledExpectedWins, fieldRatings } from "../lib/moneyball";
import { gravityTags, GRAVITY_VERSION } from "../lib/gravity";
import gravityTable from "../data/program-gravity.json";
import {
  RIVALRIES,
  buildPostseasonPath,
  buildSeasonGames,
  nextPostseasonGame,
  postseasonOpener,
  postseasonOutcome,
  preseasonExpectedWins,
  projectedRank,
  storylineFor,
  type PostseasonStage,
} from "../lib/season-mode";
import { SeasonPayloadSchema } from "../lib/season-payload";
import { DATA_FINGERPRINT, SIM_VERSION, fingerprintForTeams, replaySeason, type ReplayInput } from "../lib/season-replay";
import { adjustGameplanProbability, clampGameplanEdge, gameplanNarration, offensiveEdge, resolveGameplan, type DefTag, type GameplanPick } from "../lib/gameplan";

let failures = 0;
function assert(cond: boolean, label: string, extra?: unknown) {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}`, extra ?? "");
  }
}

const field = fieldRatings();
const program = data.teams.find((t) => t.slug === "texas")!;
const userR = ratingsFromAllocation(cappedOptimalAllocation(30));

function fakeGame(over: Partial<ScheduledGame> = {}): ScheduledGame {
  const opp = data.teams.find((t) => t.slug === "oklahoma")!;
  return {
    week: 1,
    opponent: opp,
    oppRatings: { off: 60, def: 60, st: 55 },
    isHome: true,
    winProb: 0.5,
    ...over,
  };
}

// ---------- market caps ----------
console.log("market caps");
{
  const headroom = Math.round(MARKET_HEADROOM_M * 10) / 10;
  assert(headroom === 78.3, "playsheet headroom is $78.3M", headroom);
  assert(headroom > GAME_BUDGET_M * 1.4, "headroom exceeds 1.4x the $55M book");

  for (const g of POSITION_GROUPS) {
    const members = PLAYSHEET_SLOTS.filter((s) => s.group === g.key);
    const sum = Math.round(members.reduce((s, m) => s + m.cap, 0) * 10) / 10;
    assert(sum === MARKET_CAPS[g.key], `${g.key} group cap equals member caps`, {
      sum,
      cap: MARKET_CAPS[g.key],
    });
    assert(g.max === MARKET_CAPS[g.key], `${g.key} POSITION_GROUPS.max matches MARKET_CAPS`);
  }

  const capped = cappedOptimalAllocation(30);
  const cappedSum = Math.round(POSITION_GROUPS.reduce((s, g) => s + capped[g.key], 0) * 10) / 10;
  assert(cappedSum === 30, "capped optimal spends exactly $30M", capped);
  for (const g of POSITION_GROUPS) {
    assert(capped[g.key] <= MARKET_CAPS[g.key] + 1e-9, `${g.key} within market cap`, {
      spend: capped[g.key],
      cap: MARKET_CAPS[g.key],
    });
  }

  const slots = distributeAllocationToSlots(capped);
  const slotSum = Math.round(PLAYSHEET_SLOTS.reduce((s, p) => s + slots[p.key], 0) * 10) / 10;
  assert(slotSum === 30, "playsheet split spends exactly $30M", slots);
  for (const p of PLAYSHEET_SLOTS) {
    assert(slots[p.key] <= p.cap + 1e-9, `${p.key} within $${p.cap}M cap`, slots[p.key]);
  }

  assert(GAME_BUDGET_M === 55, "default salary cap is $55M");

  assert(clampGameBudget(9) === GAME_BUDGET_MIN_M, "budget floors at $10M");
  assert(clampGameBudget(80) === GAME_BUDGET_MAX_M, "budget caps at $55M");
  assert(clampGameBudget(30.4) === 30, "budget rounds to integer millions");

  const room = MARKET_HEADROOM_M;
  assert(Math.round(room * 10) / 10 === 78.3, "starter headroom stays $78.3M at a $55M book", room);
  const capped55 = cappedOptimalAllocation(55);
  const sum55 = Math.round(POSITION_GROUPS.reduce((s, g) => s + capped55[g.key], 0) * 10) / 10;
  assert(sum55 === 55, "capped optimal at $55M spends the full book", capped55);
  for (const g of POSITION_GROUPS) {
    assert(capped55[g.key] <= MARKET_CAPS[g.key] + 1e-9, `$55M starter ${g.key} within market cap`, {
      spend: capped55[g.key],
      cap: MARKET_CAPS[g.key],
    });
  }
  const slots55 = distributeAllocationToSlots(capped55);
  for (const p of PLAYSHEET_SLOTS) {
    assert(slots55[p.key] <= p.cap + 1e-9, `${p.key} respects scaled cap`, slots55[p.key]);
  }
  const full55 = withDepth(capped55, 55);
  const fullSum = Math.round(POSITION_GROUPS.reduce((s, g) => s + full55[g.key], 0) * 10) / 10;
  assert(fullSum === 55, "$55M full allocation equals the starter book", full55);

  const shrunk = clampPlaysheetToBudget(slots55, 30);
  const shrunkSum = Math.round(PLAYSHEET_SLOTS.reduce((s, p) => s + shrunk[p.key], 0) * 10) / 10;
  assert(shrunkSum === 30, "shrinking a maxed sheet to $30M spends exactly $30M", shrunk);
  for (const p of PLAYSHEET_SLOTS) {
    assert(shrunk[p.key] <= p.cap + 1e-9, `shrunk ${p.key} within market cap`, shrunk[p.key]);
  }
}

// ---------- parent-owned playsheet transitions ----------
console.log("playsheet transitions");
{
  const initial = distributeAllocationToSlots(emptyAllocation());
  assert(
    Object.keys(initial).length === PLAYSHEET_SLOTS.length &&
      PLAYSHEET_SLOTS.every((slot) => initial[slot.key] === 0),
    "initial playsheet includes every starter and ST"
  );

  let uneven = initial;
  for (const [key, value] of [
    ["LT", 2.5], ["LG", 0.1], ["RT", 0.7],
    ["TE", 0.2], ["XWR", 2.4], ["ZWR", 0.1], ["SLOT", 0.3],
    ["ST", 0.4],
  ] as const) {
    uneven = setPlaysheetPosition(uneven, 30, key, value);
  }
  const groups = allocationFromPlaysheet(uneven);
  const expectedGroups: Allocation = { QB: 0, RB: 0, WR: 3, OL: 3.3, DL: 0, LB: 0, DB: 0, ST: 0.4 };
  assert(POSITION_GROUPS.every((group) => groups[group.key] === expectedGroups[group.key]),
    "uneven slot spends produce exact group totals", groups);
  assert(
    JSON.stringify(ratingsFromAllocation(withDepth(groups, 30))) ===
      JSON.stringify(ratingsFromAllocation(withDepth(expectedGroups, 30))),
    "unchanged playsheet produces unchanged simulated ratings"
  );
  assert(distributeAllocationToSlots(groups).LT !== uneven.LT,
    "re-distributing group totals would lose the custom tackle amount");
  assert(distributeAllocationToSlots(groups).XWR !== uneven.XWR,
    "re-distributing group totals would lose the custom receiver amount");

  // Build -> Program -> Build keeps the parent-owned object; only the step changes.
  let buildState = { step: "build", pos: uneven };
  buildState = { ...buildState, step: "program" };
  const programGroups = allocationFromPlaysheet(buildState.pos);
  buildState = { ...buildState, step: "build" };
  assert(PLAYSHEET_SLOTS.every((slot) => buildState.pos[slot.key] === uneven[slot.key]),
    "pure step round trip retains every slot including ST");
  assert(JSON.stringify(allocationFromPlaysheet(buildState.pos)) === JSON.stringify(programGroups),
    "pure step round trip retains derived group totals");

  const optimized = distributeAllocationToSlots(cappedOptimalAllocation(30));
  const optimalGroups = cappedOptimalAllocation(30);
  assert(POSITION_GROUPS.every((group) =>
    allocationFromPlaysheet(optimized)[group.key] === optimalGroups[group.key]),
    "Optimize keeps simulator group totals");
  const raised = setPlaysheetPosition(optimized, 30, "LT", 2.5);
  const raisedDimes = PLAYSHEET_SLOTS.reduce((sum, slot) => sum + Math.round(raised[slot.key] * 10), 0);
  assert(raised !== optimized && raised.LT === 2.5 && raisedDimes === 300,
    "position slider reaches market cap without exceeding a full book", raisedDimes);

  const reduced = clampPlaysheetToBudget(raised, 10);
  const reducedDimes = PLAYSHEET_SLOTS.reduce((sum, slot) => sum + Math.round(reduced[slot.key] * 10), 0);
  assert(reducedDimes === 100 && reduced.LT <= raised.LT,
    "budget reduction shrinks the playsheet in tenths", reducedDimes);
  assert(PLAYSHEET_SLOTS.every((slot) => reduced[slot.key] <= slot.cap),
    "budget reduction respects every slot cap");
  const reset = emptyPlaysheet();
  assert(PLAYSHEET_SLOTS.every((slot) => reset[slot.key] === 0),
    "Reset clears every slot including ST");
}

// ---------- storylines ----------
console.log("storylines");
{
  const cup = fakeGame({ winProb: 0.9 });
  assert(storylineFor(cup, null).tag === "Should-win", "cupcake tag");

  const david = fakeGame({ winProb: 0.1 });
  assert(storylineFor(david, null).tag === "David vs Goliath", "david tag");

  const ranked = data.teams.find((t) => t.ap_rank === 1)!;
  const stmt = fakeGame({ winProb: 0.45, opponent: ranked });
  assert(storylineFor(stmt, null).tag === "Statement game", "statement tag", ranked.slug);

  const lostPrev = fakeGame({ winProb: 0.5, result: { scoreFor: 10, scoreAgainst: 20, won: false } });
  const bounce = fakeGame({ winProb: 0.5, week: 2 });
  assert(storylineFor(bounce, lostPrev).tag === "Bounce back", "bounce-back tag");

  const bigWin = fakeGame({ winProb: 0.5, result: { scoreFor: 45, scoreAgainst: 10, won: true } });
  const trap = fakeGame({ winProb: 0.6, week: 3 });
  assert(storylineFor(trap, bigWin).tag === "Trap game", "trap tag");

  const home = fakeGame({ winProb: 0.5, isHome: true });
  assert(storylineFor(home, null).tag === "Home cooking", "home tag");

  const road = fakeGame({ winProb: 0.5, isHome: false, oppRatings: { off: 75, def: 70, st: 60 } });
  assert(storylineFor(road, null).tag === "Road test", "road tag");

  const plain = fakeGame({ winProb: 0.5, isHome: false, week: 4, oppRatings: { off: 60, def: 60, st: 55 } });
  assert(storylineFor(plain, null).tag === "Week 4", "default tag");

  for (const [stage, tag] of [
    ["qf", "Playoff quarterfinal"],
    ["sf", "Playoff semifinal"],
    ["ncg", "National championship"],
    ["bowl", "The Money Bowl"],
  ] as [PostseasonStage, string][]) {
    assert(storylineFor(fakeGame({ stage }), null).tag === tag, `stage tag ${stage}`);
  }
}

// ---------- projected rank ----------
console.log("projectedRank");
{
  assert(projectedRank(99, [1, 2, 3]) === 1, "rank 1 when best");
  assert(projectedRank(0, [1, 2, 3]) === 4, "rank last when worst");
  assert(projectedRank(2, [1, 2, 3]) === 2, "ties rank ahead (strict >)");
  assert(projectedRank(2.5, [1, 2, 3]) === 2, "fractional projection");
}

// ---------- frozen projected path, all 12 seeds ----------
console.log("postseason scheduling");
{
  const ctx = { program, teams: data.teams, userR, field };
  const used = new Set(data.teams.slice(0, 12).map((team) => team.slug));
  const expectedOpponents = [[8,4,2], [7,3,1], [6,2,1], [5,1,2], [12,4,1,2], [11,3,2,1],
    [10,2,3,1], [9,1,4,2], [8,1,4,2], [7,2,3,1], [6,3,2,1], [5,4,1,2]];
  for (let seed = 1; seed <= 12; seed++) {
    const path = buildPostseasonPath(seed, used, ctx);
    assert(JSON.stringify(path.map((game) => game.opponentSeed)) === JSON.stringify(expectedOpponents[seed - 1]), `seed ${seed}: fixed subtree representatives`);
    assert(JSON.stringify(path.map((game) => game.week)) === JSON.stringify(seed <= 4 ? [14,15,16] : [13,14,15,16]), `seed ${seed}: bye and four-round weeks`);
    assert(path[0].stage === (seed <= 4 ? "qf" : "fr"), `seed ${seed}: correct opening round`);
    assert(path.every((game) => game.playerSeed === seed), `seed ${seed}: qualification remains frozen`);
    assert(path.every((game) => gameVenue(game) === (game.stage !== "fr" ? "neutral" : seed <= 8 ? "home" : "away")), `seed ${seed}: campus opener, neutral bowls`);
    assert(new Set(path.map((game) => game.opponent.slug)).size === path.length, `seed ${seed}: unique path opponents`);
    assert(path.every((game) => game.opponent.slug !== program.slug && !used.has(game.opponent.slug) && !game.result && !game.gameplan), `seed ${seed}: projections have no rematches, calls or results`);
    for (let i = 0; i < path.length; i++) assert(nextPostseasonGame(path[i].stage!, path) === (path[i + 1] ?? null), `seed ${seed}: fixed transition ${path[i].stage}`);
    assert(JSON.stringify(buildPostseasonPath(seed, used, { ...ctx, teams: [...data.teams].reverse() })) === JSON.stringify(path), `seed ${seed}: deterministic field including budget ties`);
  }
  const bowl = buildPostseasonPath(20, used, ctx);
  assert(bowl.length === 1 && bowl[0].stage === "bowl" && bowl[0].week === 13 && gameVenue(bowl[0]) === "neutral", "nonqualifier gets one neutral peer Money Bowl");
  let poolError = false;
  try { buildPostseasonPath(1, new Set(data.teams.map((team) => team.slug)), ctx); } catch { poolError = true; }
  assert(poolError, "an insufficient eligible pool fails instead of fabricating opponents");
}

// ---------- postseasonOutcome ----------
console.log("postseasonOutcome");
{
  const won = (stage: PostseasonStage) =>
    fakeGame({ stage, result: { scoreFor: 30, scoreAgainst: 20, won: true } });
  const lost = (stage: PostseasonStage) =>
    fakeGame({ stage, result: { scoreFor: 20, scoreAgainst: 30, won: false } });
  assert(postseasonOutcome([won("qf"), won("sf"), won("ncg")]) === "National champions", "champions");
  assert(postseasonOutcome([won("qf"), won("sf"), lost("ncg")]) === "National runners-up", "runners-up");
  assert(postseasonOutcome([lost("sf")]) === "Playoff semifinalists", "semifinalists");
  assert(postseasonOutcome([lost("fr")]) === "Playoff first-round exit", "first-round exit");
  assert(postseasonOutcome([lost("qf")]) === "Playoff quarterfinalists", "quarterfinalists");
  assert(postseasonOutcome([won("bowl")]) === "Money Bowl champions", "bowl champs");
  assert(postseasonOutcome([lost("bowl")]) === "Money Bowl runners-up", "bowl runners-up");
  assert(postseasonOutcome([]) === null, "no postseason -> null");
}

// ---------- full headless season runs ----------
console.log("full season runs");

function runSeason(alloc: Allocation, seed: number, label: string) {
  // Some historical allocations below are diagnostic proposals, not publishable rosters.
  const replay = replaySeason({ mode: "season", seed, programSlug: program.slug, budgetM: 30,
    alloc, simVersion: SIM_VERSION, dataFingerprint: DATA_FINGERPRINT, gameplan: [],
    autoGameplan: true, gravityOn: false, gravityVersion: "v1" });
  const games = replay.games;
  const seedRank = replay.postseasonSeed!;

  // Invariants.
  const weeks = games.map((g) => g.week);
  assert(
    weeks.every((w, i) => w === i + 1 || (i >= 12 && w >= 13)),
    `${label}: weeks sane`,
    weeks
  );
  const regWeeks = games.filter((g) => !g.stage).map((g) => g.week);
  assert(
    regWeeks.length === 12 && regWeeks.every((w, i) => w === i + 1),
    `${label}: 12 sequential regular-season weeks`
  );
  const oppSlugs = games.map((g) => g.opponent.slug);
  assert(new Set(oppSlugs).size === oppSlugs.length, `${label}: no duplicate opponents`);
  assert(!oppSlugs.includes(program.slug), `${label}: never faces own program`);
  const stages = games.filter((g) => g.stage);
  assert(
    stages.every((g) =>
      g.stage === "fr" || g.stage === "bowl" ? g.week === 13 : g.stage === "qf" ? g.week === 14 : g.stage === "sf" ? g.week === 15 : g.week === 16
    ),
    `${label}: postseason weeks correct`,
    stages.map((g) => `${g.stage}@${g.week}`)
  );
  if (seedRank <= 12) {
    assert(stages.length >= 1 && stages[0].stage !== "bowl", `${label}: seed ${seedRank} made playoff`);
  } else {
    assert(stages.length === 1 && stages[0].stage === "bowl", `${label}: seed ${seedRank} got bowl`);
  }

  const summary = summarizeSeason(games);
  const outcome = postseasonOutcome(games);
  console.log(`    ${label}: ${summary.wins}-${summary.losses}, seed ${seedRank}, ${outcome ?? "no postseason?"}`);
}

runSeason(cappedOptimalAllocation(30), 12345, "optimal alloc");
runSeason(cappedOptimalAllocation(30), 999, "optimal alloc, seed 999");
runSeason(cappedOptimalAllocation(30), 24, "optimal alloc, playoff run (seed 24)");
runSeason(cappedOptimalAllocation(30), 147, "optimal alloc, playoff run (seed 147)");
// Lopsided: everything into QB.
const qbHeavy: Allocation = { QB: 12, RB: 2, WR: 4, OL: 3, DL: 3, LB: 2, DB: 3, ST: 1 };
runSeason(qbHeavy, 4242, "qb-heavy alloc");

// ---------- rivalries + schedule construction ----------
console.log("rivalries & buildSeasonGames");

{
  const slugs = new Set(data.teams.map((t) => t.slug));
  let reciprocal = true;
  for (const [prog, rivals] of Object.entries(RIVALRIES)) {
    assert(slugs.has(prog), `rivalry program exists: ${prog}`);
    for (const r of rivals) {
      if (!slugs.has(r.slug)) {
        assert(false, `rivalry slug exists: ${prog} -> ${r.slug}`);
      }
      const back = (RIVALRIES[r.slug] ?? []).some((x) => x.slug === prog);
      if (!back) reciprocal = false;
    }
  }
  assert(reciprocal, "all rivalries are reciprocal");
}

{
  const progs = ["texas", "ohio-state", "iowa", "notre-dame", "rutgers"];
  for (const slug of progs) {
    const prog = data.teams.find((t) => t.slug === slug)!;
    const r = ratingsFromAllocation(cappedOptimalAllocation(30));
    for (const seed of [11, 222, 9876]) {
      const games = buildSeasonGames(seed, r, prog, data.teams);
      const tag = `${slug}/seed ${seed}`;
      assert(games.length === 12, `${tag}: 12 games`);
      assert(games.every((g, i) => g.week === i + 1), `${tag}: weeks 1-12 sequential`);
      assert(games.filter((g) => g.isHome).length === 7, `${tag}: exactly 7 home games`);
      const opps = games.map((g) => g.opponent.slug);
      assert(new Set(opps).size === 12, `${tag}: no duplicate opponents`);
      assert(!opps.includes(slug), `${tag}: never plays itself`);
      // Honest test: the same (program, seed) gives the same slate for any
      // roster — only the win probabilities may differ.
      const otherR = ratingsFromAllocation(qbHeavy);
      const otherGames = buildSeasonGames(seed, otherR, prog, data.teams);
      assert(
        JSON.stringify(otherGames.map((g) => g.opponent.slug)) === JSON.stringify(opps),
        `${tag}: slate independent of roster`
      );
      const hasRivals = (RIVALRIES[slug] ?? []).length > 0;
      const rivGames = games.filter((g) => g.rivalry);
      if (hasRivals) {
        assert(rivGames.length === 1, `${tag}: exactly 1 rivalry game (got ${rivGames.length})`);
        const story = storylineFor(rivGames[0], null);
        assert(story.tag === "Rivalry week", `${tag}: rivalry storyline tag`, story.tag);
        assert(story.blurb.includes(rivGames[0].rivalry!), `${tag}: rivalry name in blurb`);
      } else {
        assert(rivGames.length === 0, `${tag}: no rivalry game for rival-less program`);
      }
      // Determinism: same inputs -> identical slate.
      const again = buildSeasonGames(seed, r, prog, data.teams);
      assert(
        JSON.stringify(again.map((g) => [g.opponent.slug, g.isHome, g.rivalry ?? null])) ===
          JSON.stringify(games.map((g) => [g.opponent.slug, g.isHome, g.rivalry ?? null])),
        `${tag}: deterministic`
      );
    }
  }
}

// ---------- replay parity and canonical publish input ----------
console.log("replay parity and publish inputs");

const replayAlloc = cappedOptimalAllocation(30);
const replayLog = (games: ScheduledGame[]) => JSON.stringify(games.map((g) => [
  g.week, g.opponent.slug, g.isHome, g.winProb, g.stage ?? null, g.result ?? null,
]));

/** Characterize the old component's one-at-a-time and fast paths before replacing them. */
function oldUiRun(
  mode: "quick" | "season", seed: number, fast: boolean,
  alloc: Allocation = replayAlloc, budgetM = 30, programChoice: TeamBudget = program
): ScheduledGame[] {
  const ratings = ratingsFromAllocation(withDepth(alloc, budgetM));
  const rng = mulberry32((seed ^ (mode === "quick" ? 0x12345 : 0x9e3779b9)) >>> 0);
  const games = buildSeasonGames(seed, ratings, programChoice, data.teams);
  if (mode === "quick") {
    if (fast) return games.map((g) => ({ ...g, result: simulateGame(ratings, g.oppRatings, g.isHome, rng) }));
    for (let i = 0; i < games.length; i++) {
      const g = games[i];
      games[i] = { ...g, result: simulateGame(ratings, g.oppRatings, g.isHome, rng) };
    }
    return games;
  }
  // Retain only the old regular-season boolean scoring characterization.
  return games.map((g) => ({ ...g, result: simulateGame(ratings, g.oppRatings, g.isHome, rng) }));
}

for (const mode of ["quick", "season"] as const) {
  for (const seed of [24, 147, 999, 12345]) {
    const input: ReplayInput = {
      mode, seed, programSlug: program.slug, budgetM: 30, alloc: replayAlloc,
      simVersion: SIM_VERSION, dataFingerprint: DATA_FINGERPRINT,
      gameplan: [], autoGameplan: true, gravityOn: false, gravityVersion: "v1",
    };
    const manual = oldUiRun(mode, seed, false);
    const fast = oldUiRun(mode, seed, true);
    const full = replaySeason(input);
    const label = `${mode}/seed ${seed}`;
    assert(replayLog(manual) === replayLog(fast), `${label}: old manual and fast paths agree`);
    if (mode === "quick") {
      assert(replayLog(full.games) === replayLog(manual), `${label}: quick sim preserves neutral results`);
    } else {
      assert(JSON.stringify(full.games.slice(0, 12).map((g) => g.opponent.slug)) ===
        JSON.stringify(manual.slice(0, 12).map((g) => g.opponent.slug)),
        `${label}: gameplan keeps the regular-season schedule`);
    }
    assert(replayLog(replaySeason(input).games) === replayLog(full.games), `${label}: repeat is deterministic`);
    assert(full.complete, `${label}: full run is complete`);
    for (let n = 0; n <= full.games.length; n++) {
      const partial = replaySeason(input, n);
      const played = partial.games.filter((g) => g.result);
      assert(replayLog(played) === replayLog(full.games.slice(0, n)), `${label}: step ${n} matches full run`);
    }
  }
}

{
  const base = { mode: "season", seed: 24, programSlug: "texas", budgetM: 30,
    alloc: replayAlloc, simVersion: SIM_VERSION, dataFingerprint: DATA_FINGERPRINT,
    gameplan: [], autoGameplan: true, gravityOn: true, gravityVersion: "v1" };
  assert(SeasonPayloadSchema.safeParse(base).success, "canonical input validates");
  assert(!SeasonPayloadSchema.safeParse({ ...base, wins: 99 }).success, "forged wins rejected");
  assert(!SeasonPayloadSchema.safeParse({ ...base, games: [] }).success, "caller game log rejected");
  assert(!SeasonPayloadSchema.safeParse({ ...base, seed: -1 }).success, "negative seed rejected");
  assert(!SeasonPayloadSchema.safeParse({ ...base, simVersion: 999 }).success, "unsupported version rejected");
  const apOnly = data.teams.map((t) => ({ ...t, ap_rank: t.ap_rank == null ? 1 : null }));
  assert(fingerprintForTeams(apOnly) === DATA_FINGERPRINT, "AP rank does not change fingerprint");
  const budgetChanged = data.teams.map((t, i) => i === 0 ? { ...t, budget_mid_m: t.budget_mid_m + 1 } : t);
  assert(fingerprintForTeams(budgetChanged) !== DATA_FINGERPRINT, "model budget changes fingerprint");
}

{
  const r = ratingsFromAllocation(cappedOptimalAllocation(30));
  const games = buildSeasonGames(77, r, program, data.teams);
  const expected = games.filter((g) => !g.stage).reduce((s, g) => s + g.winProb, 0);
  assert(
    Math.abs(preseasonExpectedWins(games) - expected) < 1e-9,
    "preseasonExpectedWins sums regular-season win probs"
  );
  assert(preseasonExpectedWins([]) === 0, "preseasonExpectedWins of empty slate is 0");
}

{
  const edgeCases: { defense: DefTag; air: number; ground: number }[] = [
    { defense: "4-3", air: 5, ground: -2 },
    { defense: "3-4", air: 5, ground: -2 },
    { defense: "3-3-5", air: -2, ground: 5 },
    { defense: "4-2-5", air: 2, ground: 2 },
    { defense: "multiple", air: 2, ground: 2 },
  ];
  for (const { defense, air, ground } of edgeCases) {
    assert(offensiveEdge("air", defense) === air, `Air it out vs ${defense} includes base +1`);
    assert(offensiveEdge("ground", defense) === ground, `Ground & pound vs ${defense} includes base +1`);
  }
  const plus = resolveGameplan({ week: 1, off: "air", def: "blitz" }, "oklahoma-state", 0.5);
  const minus = resolveGameplan({ week: 1, off: "ground", def: "blitz" }, "nc-state", 0.5);
  assert(plus.offEdge === 5 && plus.defEdge === 5 && plus.netEdge === 8, "positive gameplan edge clamps to +8 points");
  assert(minus.offEdge === -2 && minus.defEdge === -5 && minus.netEdge === -7, "negative matchup includes base +1");
  assert(clampGameplanEdge(-10) === -8, "negative combined edge clamps to -8 points");
  assert(resolveGameplan({ week: 1, off: "balanced", def: "base" }, "ohio-state", 0.5).offEdge === 3,
    "Balanced counters a multiple front by +3 points");
  assert(offensiveEdge("balanced", "multiple") > offensiveEdge("air", "multiple") &&
    offensiveEdge("balanced", "multiple") > offensiveEdge("ground", "multiple"),
    "Balanced is uniquely best against a multiple front");
  assert(resolveGameplan({ week: 1, off: "balanced", def: "base" }, "georgia", 0.5).offEdge === 0,
    "Balanced remains neutral against a 3-4 front");
  const neutralWeek1 = resolveGameplan({ week: 1, off: "balanced", def: "base" }, "georgia", 0.5);
  const neutralWeek2 = resolveGameplan({ week: 2, off: "balanced", def: "base" }, "georgia", 0.5);
  assert(gameplanNarration(neutralWeek1, true, "Georgia", 0.5).includes("Georgia"),
    "auto-style neutral week receives an opponent-specific result recap");
  assert(gameplanNarration(neutralWeek1, true, "Georgia", 0.5) !== gameplanNarration(neutralWeek2, true, "Georgia", 0.5),
    "repeated situation rotates deterministic narration wording");
  const quietRecaps = Array.from({ length: 12 }, (_, index) =>
    gameplanNarration({ ...neutralWeek1, week: index + 1 }, true, "Georgia", 0.65));
  assert(new Set(quietRecaps).size === quietRecaps.length,
    "quiet-week recaps remain distinct across a 12-game slate with the same result and odds");
  const regular: GameplanPick[] = Array.from({ length: 12 }, (_, index) => ({
    week: index + 1,
    off: index % 3 === 0 ? "air" : index % 3 === 1 ? "ground" : "balanced",
    def: index % 3 === 0 ? "blitz" : index % 3 === 1 ? "bracket" : "base",
  }));
  const base: ReplayInput = {
    mode: "season", seed: 147, programSlug: "texas", budgetM: 30,
    alloc: cappedOptimalAllocation(30), simVersion: SIM_VERSION,
    dataFingerprint: DATA_FINGERPRINT, gameplan: [], autoGameplan: true, gravityOn: true, gravityVersion: "v1",
  };
  const neutral = replaySeason(base);
  const provisional = replaySeason({ ...base, gameplan: regular });
  const mixed: ReplayInput = {
    ...base, autoGameplan: false,
    gameplan: provisional.games.map((game) => regular.find((pick) => pick.week === game.week) ??
      { week: game.week, off: "balanced", def: "base" }),
  };
  const first = JSON.stringify(replaySeason(mixed));
  const second = JSON.stringify(replaySeason(mixed));
  assert(first === second, "same seed, roster, and mixed gameplan produce byte-identical seasons");
  const played = replaySeason(mixed).games;
  for (let n = 0; n <= played.length; n++) {
    const partial = replaySeason(mixed, n).games.filter((game) => game.result);
    assert(JSON.stringify(partial) === JSON.stringify(played.slice(0, n)),
      `mixed gameplan step ${n} matches full replay`);
  }
  assert(played.every((game) => game.gameplan && Math.abs(game.gameplan.netEdge) <= 8), "every game logs its bounded gameplan");
  assert(Math.abs(preseasonExpectedWins(played) - preseasonExpectedWins(neutral.games)) < 1e-9,
    "gameplan does not change neutral preseasonExpectedWins");
  assert(JSON.stringify(played.slice(0, 12).map((game) => game.opponent.slug)) ===
    JSON.stringify(neutral.games.slice(0, 12).map((game) => game.opponent.slug)),
    "gameplan does not change the honest regular-season schedule");
}

console.log("program gravity");
{
  assert(GRAVITY_VERSION === "v1", "gravity table version is v1");
  assert(gravityTable.gravityVersion === GRAVITY_VERSION && gravityTable.teams.length === data.teams.length &&
    data.teams.every((team) => gravityTable.teams.some((entry) => entry.slug === team.slug)),
    "gravity table has one entry for every program");
  assert(gravityTable.teams.filter((entry) => entry.tags.length > 0).length === 40,
    "researched gravity table tags 40 programs");
  assert(gravityTags("texas").some((tag) => tag.group === "RB" && tag.gravity === 0.12),
    "Texas RB tag is loaded from the single data table");
  const context = { programSlug: "texas", gravityOn: true };
  const optimized = cappedOptimalAllocation(55, context);
  assert(POSITION_GROUPS.reduce((sum, g) => sum + Math.round(optimized[g.key] * 10), 0) === 550,
    "gravity-aware auto allocation spends exactly $55M in integer dimes");
  const off = ratingsFromAllocation(optimized);
  const on = ratingsFromAllocation(optimized, context);
  assert(on.off > off.off && on.def === off.def && on.st === off.st,
    "gravity changes only the tagged side's effective spend");
  const base: ReplayInput = {
    mode: "season", simVersion: SIM_VERSION, dataFingerprint: DATA_FINGERPRINT,
    seed: 147, programSlug: "texas", budgetM: 55, alloc: optimized,
    gameplan: [], autoGameplan: true, gravityOn: true, gravityVersion: GRAVITY_VERSION,
  };
  const onReplay = replaySeason(base);
  const offReplay = replaySeason({ ...base, gravityOn: false });
  assert(JSON.stringify(onReplay.games.slice(0, 12).map((g) => [g.opponent.slug, g.isHome])) ===
    JSON.stringify(offReplay.games.slice(0, 12).map((g) => [g.opponent.slug, g.isHome])),
    "gravity leaves the honest schedule unchanged");
  assert(preseasonExpectedWins(onReplay.games) > preseasonExpectedWins(offReplay.games),
    "neutral preseason expected wins include gravity");
  assert(JSON.stringify(replaySeason(base)) === JSON.stringify(onReplay),
    "gravity-on season replays byte-for-byte from published inputs");
  assert(SeasonPayloadSchema.safeParse(base).success, "gravity-on publish payload validates");
  assert(!SeasonPayloadSchema.safeParse({ ...base, gravityVersion: "v0" }).success,
    "wrong gravity table version cannot publish");
  assert(!SeasonPayloadSchema.safeParse({ ...base, gravityOn: undefined }).success,
    "gravity choice is mandatory in published payload");
}

// v4 boolean scoring and ordinary interior calls remain exactly characterized.
{
  const a = { off: 70, def: 65, st: 55 }, b = { off: 60, def: 72, st: 58 };
  assert(expectedScore(a, b, true).winProb === 0.6288800952351592 && expectedScore(a, b, false).winProb === 0.4540023479041523, "v4 boolean odds unchanged");
  assert(JSON.stringify(simulateGame(a, b, true, mulberry32(27))) === JSON.stringify({ scoreFor: 41, scoreAgainst: 36, won: true }), "v4 boolean home score unchanged");
  assert(JSON.stringify(simulateGame(a, b, false, mulberry32(27))) === JSON.stringify({ scoreFor: 38, scoreAgainst: 39, won: false }), "v4 boolean away score unchanged");
  assert(resolveGameplan({ week: 1, off: "air", def: "base" }, "lsu", 0.5).adjustedWinProb === 0.55, "v4 interior adjustment unchanged");
  const ab = expectedScore(a, b, "neutral"), ba = expectedScore(b, a, "neutral");
  assert(ab.for === ba.against && ab.against === ba.for && Math.abs(ab.winProb + ba.winProb - 1) < 1e-9, "neutral expected scoring is symmetric");
  assert(gameVenue({ isHome: true }) === "home" && gameVenue({ isHome: false }) === "away" && gameVenue({ isHome: true, venue: "neutral" }) === "neutral", "explicit venue wins with legacy boolean fallback");
  for (const p of [0, 0.00005976, 0.0009, 0.001, 0.2, 0.5, 0.999, 0.9991, 0.99994, 1]) {
    const adjusted = Array.from({ length: 17 }, (_, i) => adjustGameplanProbability(p, i - 8));
    assert(adjusted.every((value, i) => Number.isFinite(value) && value >= 0 && value <= 1 &&
      (i < 8 ? value <= p : i === 8 ? value === p : value >= p) && (i === 0 || value >= adjusted[i - 1])), `monotone bounded edge grid at p=${p}`);
  }
}

// Desired v5 contracts, first run against the unchanged v4 engine.
{
  const equal = { off: 60, def: 60, st: 60 };
  assert(Math.abs(expectedScore(equal, equal, "neutral").winProb - 0.5) < 1e-9, "v5 neutral venue has no home edge");
  const low = resolveGameplan({ week: 1, off: "ground", def: "base" }, "lsu", 0.00005976077748126585);
  assert(low.netEdge < 0 && low.adjustedWinProb <= 0.00005976077748126585, "v5 negative call cannot increase extreme underdog odds");
  const opening = postseasonOpener(1, new Set(), { program, teams: data.teams, userR, field });
  assert(opening.stage === "qf" && opening.week === 14, "v5 top-four bye leads to quarterfinal week 14");
}

console.log(failures === 0 ? "\nALL SEASON-MODE TESTS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
