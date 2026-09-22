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
  GAME_BUDGET_MAX_M,
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
import {
  RIVALRIES,
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
  assert(headroom === 43.5, "playsheet headroom is $43.5M", headroom);
  assert(headroom > 30, "headroom exceeds the $30M budget");

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

  const raw = optimalAllocation(30);
  assert(raw.QB > MARKET_CAPS.QB || raw.RB > MARKET_CAPS.RB || raw.LB > MARKET_CAPS.LB, "uncapped optimal would exceed at least one market cap");

  assert(clampGameBudget(9) === GAME_BUDGET_MIN_M, "budget floors at $10M");
  assert(clampGameBudget(80) === GAME_BUDGET_MAX_M, "budget caps at $55M");
  assert(clampGameBudget(30.4) === 30, "budget rounds to integer millions");

  const room = MARKET_HEADROOM_M;
  assert(room === 43.5, "starter headroom stays $43.5M at a $55M book", room);
  const capped55 = cappedOptimalAllocation(55);
  const sum55 = Math.round(POSITION_GROUPS.reduce((s, g) => s + capped55[g.key], 0) * 10) / 10;
  assert(sum55 === 43.5, "capped optimal at $55M spends starter headroom, not the whole book", capped55);
  for (const g of POSITION_GROUPS) {
    assert(capped55[g.key] <= MARKET_CAPS[g.key] + 1e-9, `$55M starter ${g.key} within unscaled cap`, {
      spend: capped55[g.key],
      cap: MARKET_CAPS[g.key],
    });
  }
  const slots55 = distributeAllocationToSlots(capped55);
  for (const p of PLAYSHEET_SLOTS) {
    assert(slots55[p.key] <= p.cap + 1e-9, `${p.key} cap does not scale with the book`, slots55[p.key]);
  }
  const full55 = withDepth(capped55, 55);
  const fullSum = Math.round(POSITION_GROUPS.reduce((s, g) => s + full55[g.key], 0) * 10) / 10;
  assert(fullSum === 55, "$55M book with depth sums to the program budget", full55);

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

// ---------- postseason scheduling ----------
console.log("postseason scheduling");
{
  const rng = mulberry32(42);
  const ctx = { program, teams: data.teams, userR, field, rng };
  const used = new Set(data.teams.slice(0, 12).map((t) => t.slug)); // pretend regular-season foes

  const sf1 = postseasonOpener(1, used, ctx);
  assert(sf1.stage === "sf" && sf1.week === 14, "seed 1 -> semifinal week 14", sf1);
  const sf4 = postseasonOpener(4, used, ctx);
  assert(sf4.stage === "sf" && sf4.week === 14, "seed 4 -> semifinal week 14");

  const qf5 = postseasonOpener(5, used, ctx);
  assert(qf5.stage === "qf" && qf5.week === 13, "seed 5 -> quarterfinal week 13");
  assert(qf5.isHome === true, "higher seed hosts quarterfinal");

  const qf12 = postseasonOpener(12, used, ctx);
  assert(qf12.stage === "qf" && qf12.week === 13, "seed 12 -> quarterfinal week 13");
  assert(qf12.isHome === false, "lower seed travels in quarterfinal");

  const bowl = postseasonOpener(20, used, ctx);
  assert(bowl.stage === "bowl" && bowl.week === 13, "seed 20 -> money bowl week 13");

  for (const g of [sf1, sf4, qf5, qf12, bowl]) {
    assert(!used.has(g.opponent.slug), `no rematch vs ${g.opponent.slug}`);
    assert(g.opponent.slug !== program.slug, "never faces own program");
    assert(g.winProb > 0 && g.winProb < 1, "winProb sane");
  }

  // QF winner -> SF week 14; SF winner -> NCG week 15; nothing after bowl/ncg.
  const used2 = new Set([...used, qf5.opponent.slug]);
  const sfNext = nextPostseasonGame("qf", used2, ctx);
  assert(sfNext?.stage === "sf" && sfNext?.week === 14, "qf win -> semifinal week 14");
  const used3 = new Set([...used2, sfNext!.opponent.slug]);
  const ncgNext = nextPostseasonGame("sf", used3, ctx);
  assert(ncgNext?.stage === "ncg" && ncgNext?.week === 15, "sf win -> championship week 15");
  assert(nextPostseasonGame("ncg", used3, ctx) === null, "nothing after ncg");
  assert(nextPostseasonGame("bowl", used3, ctx) === null, "nothing after bowl");

  // Determinism: same rng seed -> same opponents.
  const ctxA = { program, teams: data.teams, userR, field, rng: mulberry32(7) };
  const ctxB = { program, teams: data.teams, userR, field, rng: mulberry32(7) };
  const a = postseasonOpener(6, used, ctxA);
  const b = postseasonOpener(6, used, ctxB);
  assert(a.opponent.slug === b.opponent.slug && a.isHome === b.isHome, "deterministic with same rng");
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
  assert(postseasonOutcome([lost("qf")]) === "Playoff quarterfinalists", "quarterfinalists");
  assert(postseasonOutcome([won("bowl")]) === "Money Bowl champions", "bowl champs");
  assert(postseasonOutcome([lost("bowl")]) === "Money Bowl runners-up", "bowl runners-up");
  assert(postseasonOutcome([]) === null, "no postseason -> null");
}

// ---------- full headless season runs ----------
console.log("full season runs");

function runSeason(alloc: Allocation, seed: number, label: string) {
  const r = ratingsFromAllocation(alloc);
  const rng = mulberry32(seed);
  const ctx = { program, teams: data.teams, userR: r, field, rng };

  let games: ScheduledGame[] = buildSeasonGames(seed, r, program, data.teams);
  // Play regular season.
  games = games.map((g) => ({ ...g, result: simulateGame(r, g.oppRatings, g.isHome, rng) }));

  const fieldProj = data.teams
    .filter((t) => t.slug !== program.slug)
    .map((t) => modeledExpectedWins(t.budget_mid_m, field));
  const proj = games.reduce((s, g) => s + (g.result!.won ? 1 : 0), 0);
  const seedRank = projectedRank(proj, fieldProj);

  // Play postseason to completion.
  const used = new Set(games.map((g) => g.opponent.slug));
  let opener = postseasonOpener(seedRank, used, ctx);
  opener = { ...opener, result: simulateGame(r, opener.oppRatings, opener.isHome, rng) };
  games = [...games, opener];
  let last: ScheduledGame = opener;
  while (last.result!.won) {
    const nxt = nextPostseasonGame(last.stage!, new Set(games.map((g) => g.opponent.slug)), ctx);
    if (!nxt) break;
    const played: ScheduledGame = {
      ...nxt,
      result: simulateGame(r, nxt.oppRatings, nxt.isHome, rng),
    };
    games = [...games, played];
    last = played;
  }

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
      g.stage === "qf" ? g.week === 13 : g.stage === "bowl" ? g.week === 13 : g.stage === "sf" ? g.week === 14 : g.week === 15
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
  const field = fieldRatings();
  const fieldProj = data.teams.filter((t) => t.slug !== programChoice.slug)
    .map((t) => modeledExpectedWins(t.budget_mid_m, field));
  const ctx = { program: programChoice, teams: data.teams, userR: ratings, field, rng };
  if (fast) {
    for (let i = 0; i < 12; i++) {
      const g = games[i];
      games[i] = { ...g, result: simulateGame(ratings, g.oppRatings, g.isHome, rng) };
    }
    const rank = projectedRank(games.filter((g) => g.result?.won).length, fieldProj);
    games.push(postseasonOpener(rank, new Set(games.map((g) => g.opponent.slug)), ctx));
    while (true) {
      const g = games[games.length - 1];
      g.result = simulateGame(ratings, g.oppRatings, g.isHome, rng);
      if (!g.result.won) break;
      const next = nextPostseasonGame(g.stage!, new Set(games.map((x) => x.opponent.slug)), ctx);
      if (!next) break;
      games.push(next);
    }
    return games;
  }
  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    const result = simulateGame(ratings, g.oppRatings, g.isHome, rng);
    games[i] = { ...g, result };
    if (i === 11) {
      const rank = projectedRank(games.filter((x) => x.result?.won).length, fieldProj);
      games.push(postseasonOpener(rank, new Set(games.map((x) => x.opponent.slug)), ctx));
    } else if (g.stage && result.won) {
      const next = nextPostseasonGame(g.stage, new Set(games.map((x) => x.opponent.slug)), ctx);
      if (next) games.push(next);
    }
  }
  return games;
}

{
  const playoffProgram = data.teams.find((team) => team.slug === "boston-college")!;
  const playoffAlloc = cappedOptimalAllocation(55);
  const input: ReplayInput = {
    mode: "season", seed: 2, programSlug: playoffProgram.slug, budgetM: 55,
    alloc: playoffAlloc, simVersion: SIM_VERSION, dataFingerprint: DATA_FINGERPRINT,
  };
  const manual = oldUiRun("season", 2, false, playoffAlloc, 55, playoffProgram);
  const fast = oldUiRun("season", 2, true, playoffAlloc, 55, playoffProgram);
  const full = replaySeason(input);
  assert(full.games.filter((g) => g.stage).map((g) => g.stage).join(",") === "qf,sf,ncg",
    "playoff fixture reaches quarterfinal, semifinal, and title game");
  assert(replayLog(manual) === replayLog(fast), "playoff manual and fast paths agree");
  assert(replayLog(manual) === replayLog(full.games), "playoff shared replay matches old path");
  for (let n = 0; n <= full.games.length; n++) {
    const partial = replaySeason(input, n);
    assert(replayLog(partial.games.filter((g) => g.result)) === replayLog(full.games.slice(0, n)),
      `playoff step ${n} matches full run`);
  }
}

for (const mode of ["quick", "season"] as const) {
  for (const seed of [24, 147, 999, 12345]) {
    const input: ReplayInput = {
      mode, seed, programSlug: program.slug, budgetM: 30, alloc: replayAlloc,
      simVersion: SIM_VERSION, dataFingerprint: DATA_FINGERPRINT,
    };
    const manual = oldUiRun(mode, seed, false);
    const fast = oldUiRun(mode, seed, true);
    const full = replaySeason(input);
    const label = `${mode}/seed ${seed}`;
    assert(replayLog(manual) === replayLog(fast), `${label}: old manual and fast paths agree`);
    assert(replayLog(full.games) === replayLog(manual), `${label}: shared replay preserves old results`);
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
    alloc: replayAlloc, simVersion: SIM_VERSION, dataFingerprint: DATA_FINGERPRINT };
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

console.log(failures === 0 ? "\nALL SEASON-MODE TESTS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
