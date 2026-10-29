import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  ACTIVE_RUNS_KEY, BUILD_SETUP_KEY, restoreBuildSetup, createRun, decodeBuildDraft, decodeBuildSession, emptySession,
  encodeBuildSession, readBuildStorage, validateRun, writeBuildStorage, type ActiveRun,
  clearComparison, draftMatchesBaseline, prepareRematch, sameChallenge, startDraftRun, updateSessionRun,
} from "../lib/build-session";
import { cappedOptimalAllocation, distributeAllocationToSlots } from "../lib/simulator";
import { replaySeason, type ReplayInput } from "../lib/season-replay";
import { SeasonPayloadSchema } from "../lib/season-payload";

const fixtures = JSON.parse(readFileSync(new URL("./fixtures/model-v4-replays.json", import.meta.url), "utf8")) as {
  name: string; input: ReplayInput; ratings: unknown; games: unknown;
}[];
for (const fixture of fixtures) {
  const replay = replaySeason(fixture.input);
  assert.deepEqual(replay.ratings, fixture.ratings, `${fixture.name}: v4 ratings`);
  assert.deepEqual(replay.games.map((game) => ({ week: game.week, opponent: game.opponent.slug,
    isHome: game.isHome, stage: game.stage ?? null, winProb: game.winProb,
    gameplan: game.gameplan, result: game.result })), fixture.games, `${fixture.name}: canonical v4 games`);

  const pos = distributeAllocationToSlots(fixture.input.alloc);
  for (const count of [0, 2, replay.games.length]) {
    const input = { ...fixture.input, gameplan: fixture.input.mode === "season"
      ? replay.games.slice(0, count).map((game) => ({ week: game.week, off: game.gameplan!.off, def: game.gameplan!.def })) : [] };
    const run: ActiveRun = { id: randomUUID(), input, pos, completedGames: count,
      featured: count === replay.games.length ? count - 1 : count, pending: null, publish: null };
    const session = { ...emptySession(), selectedMode: input.mode, runs: { [input.mode]: run } };
    const decoded = decodeBuildSession(encodeBuildSession(session));
    assert.equal(decoded.status, "valid", fixture.name);
    assert.deepEqual(decoded.session, session);
    assert.deepEqual(replaySeason(decoded.session.runs[input.mode]!.input, count).games, replaySeason(input, count).games);
  }
}
console.log("  ok fixed v4 Quick/manual/Auto/gravity-off goldens and partial/finished round trips");

const draft = { pos: distributeAllocationToSlots(fixtures[0].input.alloc), budgetM: 55, gravityOn: true, programSlug: "texas" };
const quick = createRun("quick", draft, randomUUID(), 24);
const manual = createRun("season", draft, randomUUID(), 147);
const pending = { ...manual, pending: { week: 1, off: "air" as const, def: null } };
const session = { ...emptySession(), runs: { quick, season: pending } };
assert.deepEqual(decodeBuildSession(encodeBuildSession(session)).session, session);
const partialDraft = { ...draft, pos: { ...draft.pos, QB: 0 } };
assert.deepEqual(decodeBuildDraft(JSON.stringify(partialDraft)), partialDraft, "legacy draft can be under budget");
assert.throws(() => createRun("quick", partialDraft, randomUUID(), 24));
assert.equal(decodeBuildSession(null).status, "absent");
for (const malformed of ["", "{", "null", "[]", JSON.stringify({ ...session, version: 99 })]) assert.equal(decodeBuildSession(malformed).status, "malformed");

function reject(mutator: (run: ActiveRun) => void) {
  const run = structuredClone(manual);
  mutator(run);
  assert.equal(validateRun(run, "season"), null);
  assert.equal(decodeBuildSession(JSON.stringify({ ...emptySession(), runs: { season: run } })).status, "malformed");
}
for (const count of [-1, 0.5, 16, 1_000_000]) reject((run) => { run.completedGames = count; });
reject((run) => { run.completedGames = 1; }); // missing committed manual pick
reject((run) => { run.input.budgetM = 54; });
reject((run) => { run.pos.QB -= 0.1; });
reject((run) => { run.pos.QB = 0.11; });
reject((run) => { run.input.programSlug = "unknown"; });
reject((run) => { run.input.seed = -1; });
reject((run) => { run.featured = 8; });
reject((run) => { run.pending = { week: 2, off: "air", def: "base" }; });
reject((run) => { run.input.gameplan = [{ week: 1, off: "air", def: "base" }, { week: 1, off: "ground", def: "blitz" }]; });
reject((run) => { run.input.gameplan = [{ week: 2, off: "air", def: "base" }, { week: 1, off: "ground", def: "blitz" }]; });
const overspent = structuredClone(quick);
overspent.pos.QB += 0.1; overspent.input.alloc.QB += 0.1;
assert.equal(validateRun(overspent, "quick"), null);
for (const field of ["simVersion", "dataFingerprint", "gravityVersion"] as const) {
  const stale = structuredClone(manual);
  Object.assign(stale.input, { [field]: field === "simVersion" ? 3 : "stale" });
  const decoded = decodeBuildSession(JSON.stringify({ ...emptySession(), runs: { season: stale } }));
  assert.equal(decoded.status, "incompatible");
  assert.deepEqual(decoded.session.runs, {});
  assert.deepEqual(decoded.session.notices[0].draft, draft);
  assert.equal(decodeBuildSession(encodeBuildSession(decoded.session)).session.notices.length, 1, "incompatible notice survives another reload");
}
console.log("  ok malformed/unsupported saves, legacy partial draft, counts, ordered calls, slot/group/exact-book validation");

const completed = { ...quick, completedGames: 12, featured: 11 };
const publish = { key: randomUUID(), payload: SeasonPayloadSchema.parse({ ...completed.input, gmName: "Saved GM" }) };
const published = { ...completed, publish: { ...publish, result: { id: "saved-id" } } };
assert(validateRun(completed, "quick"));
assert(validateRun({ ...completed, publish }, "quick"));
assert(validateRun(published, "quick"));
assert.equal(validateRun({ ...quick, publish }, "quick"), null, "unfinished run cannot have a publish attempt");
assert.equal(validateRun({ ...published, publish: { ...published.publish, payload: { ...publish.payload, seed: 88 } } }, "quick"), null);
assert.equal(validateRun({ ...published, publish: { ...published.publish, key: "not-uuid" } }, "quick"), null);
assert.equal(validateRun({ ...published, publish: { ...published.publish, key: "00000000-0000-1000-8000-000000000000" } }, "quick"), null, "API requires a UUID v4 publish key");
assert.equal(validateRun({ ...published, publish: { ...published.publish, result: { id: "https://evil.example" } } }, "quick"), null);
assert.equal(validateRun({ ...manual, completedGames: 1, input: { ...manual.input, gameplan: [{ week: 1, off: "air", def: "base" }] }, pending: { week: 1, off: "air", def: "base" } }, "season"), null);

const unavailable = () => { throw new Error("Storage denied"); };
assert.deepEqual(readBuildStorage(unavailable, ACTIVE_RUNS_KEY), { available: false, raw: null });
assert.equal(writeBuildStorage(unavailable, ACTIVE_RUNS_KEY, "test"), false);
const quota = () => ({ getItem: () => null, setItem: () => { throw new Error("Quota exceeded"); } });
assert.equal(writeBuildStorage(quota, ACTIVE_RUNS_KEY, "test"), false);
const memory = new Map<string, string>();
const storage = () => ({ getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, raw: string) => { memory.set(key, raw); } });
assert(writeBuildStorage(storage, ACTIVE_RUNS_KEY, encodeBuildSession(session)));
assert.deepEqual(decodeBuildSession(readBuildStorage(storage, ACTIVE_RUNS_KEY).raw).session, session);
console.log("  ok independent mode saves, pending picks, frozen publish attempts/results, storage denial and quota");
let seedsCreated = 0;
const seedOnce = () => { seedsCreated += 1; return 248; };
for (const raw of [null, "{", "null", JSON.stringify({ version: 1, seed: -1, complete: true }), JSON.stringify({ version: 1, seed: 4.2, complete: true }), JSON.stringify({ version: 1, seed: 2 ** 31, complete: true }), JSON.stringify({ version: 1, seed: 8, complete: "yes" })]) {
  const before = seedsCreated;
  const migrated = restoreBuildSetup(raw, seedOnce);
  assert.equal(seedsCreated, before + 1);
  assert.deepEqual(migrated, { version: 1, seed: 248, complete: false });
  assert(writeBuildStorage(storage, BUILD_SETUP_KEY, JSON.stringify(migrated)));
  assert.deepEqual(restoreBuildSetup(readBuildStorage(storage, BUILD_SETUP_KEY).raw, seedOnce), migrated);
  assert.equal(seedsCreated, before + 1, "reload retains seed without another RNG call");
  assert.deepEqual(decodeBuildDraft(JSON.stringify(partialDraft)), partialDraft, "migration preserves every legacy roster amount");
  assert.deepEqual(decodeBuildSession(encodeBuildSession(session)).session, session, "migration preserves active seeds, calls and results");
}
assert.deepEqual(restoreBuildSetup(JSON.stringify({ version: 1, seed: 147, complete: true }), () => { throw new Error("Seed must not regenerate"); }), { version: 1, seed: 147, complete: true });
console.log("  ok one-time/idempotent setup migration, retained setup seeds/completion and untouched legacy drafts/010 runs");
const opened = prepareRematch({ ...emptySession(), runs: { quick: published, season: manual } }, published);
assert.equal(opened.session.runs.quick, published, "opening setup preserves the original run and share");
assert.equal(opened.session.runs.season, manual, "opening setup preserves the other mode");
assert.equal(opened.seed, published.input.seed);
assert.deepEqual(decodeBuildSession(encodeBuildSession(opened.session)).session, opened.session);
assert(draftMatchesBaseline(opened.session, opened.draft, opened.seed));
const edited = { ...opened.draft, pos: distributeAllocationToSlots(cappedOptimalAllocation(55, { programSlug: "texas", gravityOn: false })) };
const started = startDraftRun(opened.session, edited, "quick", randomUUID(), opened.seed);
const rematch = started.runs.quick!;
assert(sameChallenge(rematch.input, published.input));
assert.notEqual(rematch.id, published.id);
assert.equal(rematch.publish, null);
assert.equal(rematch.completedGames, 0);
assert.equal(rematch.pending, null);
assert.deepEqual(rematch.input.gameplan, []);
assert.equal(started.rematch, undefined);
assert.equal(started.baseline!.publish!.result!.id, "saved-id");
const late = updateSessionRun(started, { ...published, publish: { ...published.publish, result: { id: "late-source-share" } } });
assert.equal(late.baseline!.publish!.result!.id, "late-source-share", "late source publication updates only its retained baseline");
assert.equal(late.runs.quick, rematch, "late source response never overwrites the new run or its publish identity");
assert.deepEqual(decodeBuildSession(encodeBuildSession(late)).session, late);
assert.equal(updateSessionRun(started, { ...published, id: randomUUID() }), started, "untracked responses are ignored");
const slate = (run: ActiveRun) => replaySeason(run.input, 0).games.map((g) => [g.opponent.slug, g.isHome]);
assert.deepEqual(slate(rematch), slate(published), "all 12 opponent/venue pairs survive allocation changes");
for (const change of [{ programSlug: "iowa" }, { budgetM: 54 }, { gravityOn: false }]) assert(!draftMatchesBaseline(opened.session, { ...opened.draft, ...change }, opened.seed));
assert(!draftMatchesBaseline(opened.session, opened.draft, opened.seed + 1));
assert(!draftMatchesBaseline(opened.session, opened.draft, opened.seed, "season"));
assert.equal(clearComparison(started).baseline, undefined);
assert.throws(() => prepareRematch(emptySession(), manual), /Finish/);
for (const field of ["simVersion", "dataFingerprint", "gravityVersion"] as const) {
  const stale = structuredClone(started);
  Object.assign(stale.baseline!.input, { [field]: field === "simVersion" ? 3 : "stale" });
  const recovered = decodeBuildSession(JSON.stringify(stale));
  assert.equal(recovered.status, "valid");
  assert.equal(recovered.comparisonDiscarded, true);
  assert.equal(recovered.session.baseline, undefined);
  assert.deepEqual(recovered.session.runs, started.runs, "stale baseline cannot discard supported active runs");
}
const seasonFixture = fixtures.find((f) => f.input.mode === "season")!;
const finishedReplay = replaySeason(seasonFixture.input);
const finishedManual: ActiveRun = { id: randomUUID(), input: structuredClone(seasonFixture.input), pos: distributeAllocationToSlots(seasonFixture.input.alloc), completedGames: finishedReplay.games.length,
  featured: finishedReplay.games.length - 1, pending: null, publish: null };
const seasonRematch = prepareRematch(emptySession(), finishedManual);
const nextSeason = startDraftRun(seasonRematch.session, seasonRematch.draft, "season", randomUUID(), seasonRematch.seed);
assert.equal(nextSeason.runs.season!.input.autoGameplan, false);
assert.deepEqual(nextSeason.runs.season!.input.gameplan, []);
assert.deepEqual(slate(nextSeason.runs.season!), slate(finishedManual));
assert.deepEqual(decodeBuildSession(encodeBuildSession(nextSeason)).session, nextSeason);
console.log("  ok bounded rematch baseline, explicit replacement, frozen settings/slate, fresh calls/publish identity and stale-baseline isolation");
console.log("All build session tests passed.");
