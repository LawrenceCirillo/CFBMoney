/**
 * Deterministic tests for season mode (lite): storylines, projected rank,
 * postseason scheduling, outcomes, and full headless season runs whose
 * payloads must validate against SeasonPayloadSchema.
 *
 * Run with: npx tsx scripts/test-season-mode.ts
 */
import { data } from "../lib/data";
import type { TeamBudget } from "../lib/types";
import {
  mulberry32,
  optimalAllocation,
  cappedOptimalAllocation,
  clampGameBudget,
  clampPlaysheetToBudget,
  distributeAllocationToSlots,
  GAME_BUDGET_MAX_M,
  GAME_BUDGET_MIN_M,
  MARKET_CAPS,
  MARKET_HEADROOM_M,
  PLAYSHEET_SLOTS,
  POSITION_GROUPS,
  ratingsFromAllocation,
  simulateGame,
  summarizeSeason,
  archetype,
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

  // Payload must validate (this is what PublishPanel sends).
  const summary = summarizeSeason(games);
  const payload = {
    programSlug: program.slug,
    programName: program.name,
    programColor: program.color,
    budgetM: 30,
    alloc,
    seed,
    wins: summary.wins,
    losses: summary.losses,
    expectedWins: summary.expectedWins,
    avgMargin: summary.avgMargin,
    off: r.off,
    def: r.def,
    st: r.st,
    tags: archetype(alloc),
    bestWin: summary.bestWin ?? null,
    worstLoss: summary.worstLoss ?? null,
    games: games.map((g) => ({
      week: g.week,
      oppName: g.opponent.name,
      oppSlug: g.opponent.slug,
      oppColor: g.opponent.color,
      isHome: g.isHome,
      winProb: g.winProb,
      scoreFor: g.result!.scoreFor,
      scoreAgainst: g.result!.scoreAgainst,
      won: g.result!.won,
      stage: g.stage,
    })),
  };
  const valid = SeasonPayloadSchema.safeParse(payload);
  assert(valid.success, `${label}: payload validates`, valid.success ? "" : valid.error.issues.slice(0, 3));

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

// ---------- bye-week payload & preseason projection ----------
console.log("bye-week payload & preseason projection");

{
  // A top-4 seed's first-round bye skips week 13: weeks 1-12, then week 14.
  const mkGame = (week: number, won: boolean, stage?: "qf" | "sf" | "ncg" | "bowl") => ({
    week,
    oppName: "Oklahoma",
    oppSlug: "oklahoma",
    oppColor: "#841617",
    isHome: true,
    winProb: 0.5,
    scoreFor: won ? 30 : 20,
    scoreAgainst: won ? 20 : 30,
    won,
    ...(stage ? { stage } : {}),
  });
  const base = {
    programSlug: "texas",
    programName: "Texas",
    programColor: "#bf5700",
    budgetM: 30,
    alloc: cappedOptimalAllocation(30),
    seed: 24,
    expectedWins: 7.2,
    avgMargin: 8.5,
    off: 67,
    def: 71,
    st: 81,
    tags: ["Balanced"],
    bestWin: null,
    worstLoss: null,
  };
  const byeGames = [
    ...Array.from({ length: 10 }, (_, i) => mkGame(i + 1, true)),
    mkGame(11, false),
    mkGame(12, false),
    mkGame(14, false, "sf"),
  ];
  const byePayload = { ...base, wins: 10, losses: 3, games: byeGames };
  assert(SeasonPayloadSchema.safeParse(byePayload).success, "bye-week payload validates");

  const bowlGames = [
    ...Array.from({ length: 8 }, (_, i) => mkGame(i + 1, true)),
    ...Array.from({ length: 4 }, (_, i) => mkGame(i + 9, false)),
    mkGame(13, true, "bowl"),
  ];
  const bowlPayload = { ...base, wins: 9, losses: 4, games: bowlGames };
  assert(SeasonPayloadSchema.safeParse(bowlPayload).success, "bowl payload validates");

  const badGames = [
    ...Array.from({ length: 11 }, (_, i) => mkGame(i + 1, true)),
    mkGame(13, true, "bowl"), // missing week 12
  ];
  const badPayload = { ...base, wins: 12, losses: 0, games: badGames };
  assert(!SeasonPayloadSchema.safeParse(badPayload).success, "payload with missing week 12 rejected");
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
