// Locked 2026 player valuation method. Keep arithmetic in integer units/dollars.
import { matchingRosterPlayers } from "./payroll-names.mjs";
export const POSITION_WEIGHTS_TWICE = Object.freeze({
  QB: 20, WR: 8, DE: 8, OL: 6, DL: 6, DB: 5,
  LB: 5, RB: 5, TE: 3, K: 2, P: 2, LS: 1,
});
export const POSITION_NORMALIZATION = Object.freeze({
  CB: "DB", S: "DB", DT: "DL",
  EDGE: "DE", OT: "OL", FB: "RB", C: "OL", PR: "WR",
});
export const CLASS_MULTIPLIERS_TWENTIETHS = Object.freeze({ SR: 28, JR: 23, SO: 20, FR: 14 });
export const FLOOR_DOLLARS = 25_000;
const ANCHOR_SOURCES = new Set(["anchor:on3", "anchor:reported"]);

function fail(team, message) {
  throw new Error(`${team}: ${message}`);
}

// Python's round() breaks exact half-thousand ties toward the even thousand.
function roundToThousandLikePython(numerator, denominator) {
  const divisor = BigInt(denominator) * 1000n;
  const quotient = BigInt(numerator) / divisor;
  const remainder = BigInt(numerator) % divisor;
  const rounded = remainder * 2n > divisor ||
    (remainder * 2n === divisor && quotient % 2n !== 0n)
    ? quotient + 1n : quotient;
  return Number(rounded * 1000n);
}

export function valueRoster({ teamSlug, roster, budget, qb1Name, anchors = [], allowLegacyAnchorSources = false }) {
  if (!Array.isArray(roster) || roster.length === 0) fail(teamSlug, "roster is missing or empty");
  if (!Number.isSafeInteger(budget) || budget <= 0) fail(teamSlug, `invalid dollar budget ${budget}`);
  if (typeof qb1Name !== "string" || !qb1Name) fail(teamSlug, "missing QB1 designation");

  const players = roster.map((player, index) => {
    const name = player.name;
    const originalPosition = player.pos ?? player.position;
    const position = POSITION_NORMALIZATION[originalPosition] ?? originalPosition;
    const playerClass = player.year ?? player.class;
    if (!name || typeof name !== "string") fail(teamSlug, `roster row ${index + 1} has no name`);
    // A name can identify two distinct roster records; QB1s and anchors must
    // resolve to exactly one record before either receives special treatment.
    if (!Object.hasOwn(POSITION_WEIGHTS_TWICE, position)) fail(teamSlug, `${name}: unknown position label ${JSON.stringify(originalPosition)}`);
    if (!Object.hasOwn(CLASS_MULTIPLIERS_TWENTIETHS, playerClass)) fail(teamSlug, `${name}: unknown class label ${JSON.stringify(playerClass)}`);
    return {
      name, jersey: player.jersey ?? null,
      originalPosition, position, class: playerClass,
      qb1: false,
    };
  });
  const qb1Matches = matchingRosterPlayers(players, qb1Name);
  if (qb1Matches.length !== 1) fail(teamSlug, `QB1 ${JSON.stringify(qb1Name)} has ${qb1Matches.length} suffix-normalized roster matches; expected exactly one`);
  if (qb1Matches[0].position !== "QB") fail(teamSlug, `designated QB1 ${qb1Name} has position ${qb1Matches[0].position}`);
  qb1Matches[0].qb1 = true;

  const anchorByName = new Map();
  for (const anchor of anchors) {
    const matches = matchingRosterPlayers(players, anchor.name);
    if (matches.length !== 1) fail(teamSlug, `anchor ${JSON.stringify(anchor.name)} has ${matches.length} suffix-normalized roster matches; expected exactly one`);
    const matchedName = matches[0].name;
    if (anchorByName.has(matchedName)) fail(teamSlug, `duplicate anchor for ${matchedName}`);
    if (!Number.isSafeInteger(anchor.value) || anchor.value < FLOOR_DOLLARS) fail(teamSlug, `invalid anchor value for ${anchor.name}`);
    if (!ANCHOR_SOURCES.has(anchor.source) && !allowLegacyAnchorSources) fail(teamSlug, `unverified anchor source for ${anchor.name}: ${anchor.source}`);
    if (!anchor.sourceUrl && !allowLegacyAnchorSources) fail(teamSlug, `anchor ${anchor.name} has no source URL`);
    anchorByName.set(matchedName, anchor);
  }
  const anchorSum = anchors.reduce((sum, anchor) => sum + anchor.value, 0);
  if (anchorSum >= budget) fail(teamSlug, `anchor sum $${anchorSum} >= budget $${budget}`);

  const modeled = [];
  for (const player of players) {
    const anchor = anchorByName.get(player.name);
    if (anchor) {
      player.valuation = anchor.value;
      player.source = anchor.source;
      continue;
    }
    let weightTwice = POSITION_WEIGHTS_TWICE[player.position];
    if (player.position === "QB" && !player.qb1) weightTwice = 8;
    // Common scale: position x2, class x20, QB1 x4 (7 if designated).
    player.units = weightTwice * CLASS_MULTIPLIERS_TWENTIETHS[player.class] * (player.qb1 ? 7 : 4);
    modeled.push(player);
  }
  if (!modeled.length) fail(teamSlug, "no modeled players for residual correction");
  const totalUnits = modeled.reduce((sum, player) => sum + player.units, 0);
  const pool = budget - anchorSum;
  for (const player of modeled) {
    player.valuation = Math.max(FLOOR_DOLLARS, roundToThousandLikePython(player.units * pool, totalUnits));
    player.source = "model";
  }
  const beforeCorrection = players.reduce((sum, player) => sum + player.valuation, 0);
  const residual = budget - beforeCorrection;
  if (residual !== 0) {
    // Array iteration retains the first player in a tie, as the pilot does.
    const largest = modeled.reduce((best, player) => player.valuation > best.valuation ? player : best);
    largest.valuation += residual;
  }
  const sum = players.reduce((total, player) => total + player.valuation, 0);
  if (sum !== budget) fail(teamSlug, `payroll sum $${sum} != budget $${budget}`);
  const belowFloor = players.find((player) => player.valuation < FLOOR_DOLLARS);
  if (belowFloor) fail(teamSlug, `${belowFloor.name} below $${FLOOR_DOLLARS} floor after correction`);
  return {
    teamSlug, budget, qb1Name,
    anchorCount: anchors.length, anchorSum, floorHits: players.filter((player) => player.valuation === FLOOR_DOLLARS).length,
    residual, sum,
    players: players.map(({ units, ...player }) => player),
  };
}
