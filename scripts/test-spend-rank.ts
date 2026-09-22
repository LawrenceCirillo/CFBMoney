/**
 * Spend ranking: competition ranks, book vs the 68, conference ties,
 * Week 3 AP value gap.
 *
 * Run with: npx tsx scripts/test-spend-rank.ts
 */
import { data } from "../lib/data";
import { bookStanding, competitionRank, conferenceSpendRank } from "../lib/spend-rank";

let failures = 0;
function assert(cond: boolean, label: string, extra?: unknown) {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}`, extra ?? "");
  }
}

console.log("competition rank");
{
  assert(competitionRank(10, [10, 8, 8, 5]) === 1, "top value is rank 1");
  assert(competitionRank(8, [10, 8, 8, 5]) === 2, "tied values share rank 2 (1224)");
  assert(competitionRank(5, [10, 8, 8, 5]) === 4, "next after a tie skips to 4");
}

console.log("book vs the 68");
{
  const at30 = bookStanding(30, data.teams);
  assert(at30.of === 68, "field is 68 programs", at30.of);
  assert(at30.rank === 23, "$30M sits after the two $30.5M books", at30);
  assert(at30.tiedWith.length === 0, "$30M is not an exact Athletic midpoint");
  assert(at30.nearest.slug === "clemson", "$30M nearest is Clemson at $30.5M", at30.nearest.slug);

  const osu = data.teams.find((t) => t.slug === "ohio-state")!;
  const osuBook = bookStanding(osu.budget_mid_m, data.teams);
  assert(osuBook.rank === 1, "Ohio State's midpoint is spend #1", osuBook);
  assert(osuBook.tiedWith.some((t) => t.slug === "ohio-state"), "ties include self");

  const oleMiss = data.teams.find((t) => t.slug === "ole-miss")!;
  const tennessee = data.teams.find((t) => t.slug === "tennessee")!;
  assert(oleMiss.spend_rank === 8, "Ole Miss spend rank 8", oleMiss.spend_rank);
  assert(tennessee.spend_rank === 8, "Tennessee tied at spend 8", tennessee.spend_rank);
  assert(oleMiss.budget_mid_m === tennessee.budget_mid_m, "same midpoint");
}

console.log("AP through week 3");
{
  assert(data.poll.week === 3, "poll week is 3", data.poll);
  assert(data.poll.as_of === "2026-09-20", "poll date is Sept. 20", data.poll.as_of);
  const texas = data.teams.find((t) => t.slug === "texas")!;
  const georgia = data.teams.find((t) => t.slug === "georgia")!;
  const oregon = data.teams.find((t) => t.slug === "oregon")!;
  const houston = data.teams.find((t) => t.slug === "houston")!;
  const iowa = data.teams.find((t) => t.slug === "iowa")!;
  const aggies = data.teams.find((t) => t.slug === "texas-am")!;
  const florida = data.teams.find((t) => t.slug === "florida")!;
  const virginia = data.teams.find((t) => t.slug === "virginia")!;
  const oklahoma = data.teams.find((t) => t.slug === "oklahoma")!;
  const washington = data.teams.find((t) => t.slug === "washington")!;

  assert(texas.ap_rank === 1, "Texas is AP #1 through week 3", texas.ap_rank);
  assert(texas.preseason_rank === 5, "Texas was preseason #5", texas.preseason_rank);
  assert(georgia.ap_rank === 2 && georgia.spend_rank === 19, "Georgia AP 2 / spend 19");
  assert(georgia.value_gap === 17, "Georgia value +17 through week 3", georgia.value_gap);
  assert(oregon.ap_rank === 20 && oregon.spend_rank === 2, "Oregon AP 20 / spend 2");
  assert(oregon.value_gap === -18, "Oregon value −18 through week 3", oregon.value_gap);
  assert(houston.ap_rank === 25, "Houston AP #25", houston.ap_rank);
  assert(iowa.ap_rank === 17 && iowa.value_gap === 38, "Iowa is the best value at +38", iowa.value_gap);
  assert(aggies.ap_rank === 23 && aggies.value_gap === -18, "Texas A&M fell to 23, gap −18", aggies);
  assert(florida.ap_rank === 21, "Florida entered at 21", florida.ap_rank);
  assert(virginia.ap_rank == null, "Virginia fell out after week 3");
  assert(oklahoma.ap_rank == null, "Oklahoma fell out after week 3");
  assert(washington.ap_rank == null, "Washington stayed out");
  assert(washington.preseason_rank === 17, "Washington was preseason #17");
  assert(
    data.teams.filter((t) => t.ap_rank != null).length === 25,
    "exactly 25 AP-ranked teams"
  );
  assert(data.fpi.as_of === "2026-09-22", "ESPN FPI snapshot is Sept. 22", data.fpi.as_of);
  assert(texas.sos_played_rank === 21 && texas.sos_remaining_rank === 5, "Texas SOS 21 played / 5 remaining", texas);
  assert(georgia.sos_played_rank === 120 && georgia.sos_remaining_rank === 21, "Georgia SOS 120 played / 21 remaining", georgia);
  assert(
    data.teams.every((t) => t.sos_played_rank >= 1 && t.sos_remaining_rank >= 1),
    "every program has an ESPN SOS rank"
  );
}

console.log("conference competition rank");
{
  const texas = data.teams.find((t) => t.slug === "texas")!;
  const sec = conferenceSpendRank(texas, data.teams);
  assert(sec.of === 16, "SEC has 16", sec);
  assert(sec.rank === 1, "Texas is the SEC's top book", sec);
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall spend-rank tests passed");
