/**
 * Spend ranking: competition ranks, book vs the 68, conference ties,
 * current AP invariants, and a frozen Week 3 historical fixture.
 *
 * Run with: npx tsx scripts/test-spend-rank.ts
 */
import { data } from "../lib/data";
import { bookStanding, competitionRank, conferenceSpendRank } from "../lib/spend-rank";
import week3 from "./fixtures/week3-spend-rank-2026.json";

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

console.log("current AP and ESPN invariants");
{
  const ranked = data.teams.filter((team) => team.ap_rank != null);
  assert(Number.isInteger(data.poll.week) && data.poll.week >= 1, "current poll has a week");
  assert(/^\d{4}-\d{2}-\d{2}$/.test(data.poll.as_of), "current poll has an ISO date");
  assert(ranked.length === 25, "exactly 25 AP-ranked teams", ranked.length);
  assert(
    ranked.map((team) => team.ap_rank).sort((a, b) => a! - b!).every((rank, i) => rank === i + 1),
    "current AP ranks are unique 1–25"
  );
  const mids = data.teams.map((team) => team.budget_mid_m);
  assert(data.teams.every((team) => team.spend_rank === competitionRank(team.budget_mid_m, mids)),
    "every spend rank follows the current budget books");
  assert(data.teams.every((team) => team.value_gap ===
    (team.ap_rank == null ? null : team.spend_rank - team.ap_rank)),
    "every current value gap uses the current AP rank");
  assert(data.teams.every((team) => team.sos_played_rank >= 1 && team.sos_remaining_rank >= 1),
    "every program has valid ESPN SOS ranks");
}

console.log("frozen Week 3 fixture");
{
  assert(week3.poll.week === 3 && week3.poll.as_of === "2026-09-20",
    "Week 3 poll date remains fixed");
  assert(week3.fpi_as_of === "2026-09-22", "Week 3 FPI date remains fixed");
  const t = week3.teams;
  assert(t.texas.ap_rank === 1 && t.texas.preseason_rank === 5, "Texas AP #1, preseason #5");
  assert(t.texas.sos_played_rank === 21 && t.texas.sos_remaining_rank === 5,
    "Texas Week 3 SOS is preserved");
  assert(t.georgia.ap_rank === 2 && t.georgia.spend_rank === 19 &&
    t.georgia.value_gap === t.georgia.spend_rank - t.georgia.ap_rank,
    "Georgia Week 3 gap is +17");
  assert(t.georgia.sos_played_rank === 120 && t.georgia.sos_remaining_rank === 21,
    "Georgia Week 3 SOS is preserved");
  assert(t.oregon.ap_rank === 20 && t.oregon.spend_rank === 2 &&
    t.oregon.value_gap === t.oregon.spend_rank - t.oregon.ap_rank,
    "Oregon Week 3 gap is −18");
  assert(t.houston.ap_rank === 25 && t.iowa.ap_rank === 17 && t.iowa.value_gap === 38,
    "Houston and Iowa Week 3 ranks are preserved");
  assert(t["texas-am"].ap_rank === 23 && t["texas-am"].value_gap === -18 &&
    t.florida.ap_rank === 21, "Texas A&M and Florida Week 3 ranks are preserved");
  assert(t.virginia.ap_rank == null && t.oklahoma.ap_rank == null &&
    t.washington.ap_rank == null && t.washington.preseason_rank === 17,
    "Week 3 unranked changes are preserved");
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
