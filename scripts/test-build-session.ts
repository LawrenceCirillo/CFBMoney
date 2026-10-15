import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  ACTIVE_RUNS_KEY, createRun, decodeBuildDraft, decodeBuildSession, emptySession,
  encodeBuildSession, readBuildStorage, validateRun, writeBuildStorage, type ActiveRun,
} from "../lib/build-session";
import { distributeAllocationToSlots } from "../lib/simulator";
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
console.log("All build session tests passed.");
