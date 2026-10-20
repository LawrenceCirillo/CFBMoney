import assert from "node:assert/strict";

/** A missing ballot is unavailable history, never a poll of unranked teams. */
export function rankMovement(currentRank, previousRank, hasPrevious) {
  if (!hasPrevious) return { currentRank, previousRank: null, change: null, status: "unavailable" };
  if (currentRank == null || previousRank == null) {
    return { currentRank, previousRank, change: null, status: currentRank == null ? previousRank == null ? "unranked" : "dropped" : "entered" };
  }
  const change = previousRank - currentRank;
  return { currentRank, previousRank, change, status: change > 0 ? "up" : change < 0 ? "down" : "unchanged" };
}

/** Build only from saved inputs. No clock, network request, or session history. */
export function buildMoneyballHistory(pollText, current, spendHistory) {
  const lines = pollText.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  assert.equal(lines.shift(), "week,team,rank", "Unexpected AP CSV header");
  const byName = new Map(current.teams.map((team) => [team.name, team]));
  const ballots = new Map();
  for (const line of lines) {
    const [weekText, name, rankText, extra] = line.split(",");
    const week = Number(weekText), rank = Number(rankText);
    assert(extra === undefined && name && Number.isInteger(week) && week >= 0 && Number.isInteger(rank) && rank >= 1 && rank <= 25, `Invalid AP row: ${line}`);
    const ballot = ballots.get(week) ?? [];
    ballot.push({ name, slug: byName.get(name)?.slug ?? null, rank });
    ballots.set(week, ballot);
  }
  for (const [week, ballot] of ballots) {
    assert.equal(ballot.length, 25, `AP Week ${week} must contain 25 entries`);
    assert.equal(new Set(ballot.map((row) => row.name)).size, 25, `Duplicate AP names in Week ${week}`);
    ballot.sort((a, b) => a.rank - b.rank);
    let lastRank = 0;
    for (const [index, row] of ballot.entries()) {
      if (row.rank !== lastRank) assert.equal(row.rank, index + 1, `Invalid competition ranks in AP Week ${week}`);
      lastRank = row.rank;
    }
  }
  const currentWeek = Math.max(...ballots.keys());
  assert.equal(currentWeek, current.poll.week, "AP history and current snapshot disagree");
  const previousWeek = [...ballots.keys()].filter((week) => week < currentWeek).sort((a, b) => b - a)[0];
  assert.equal(spendHistory.season, current.season, "Spend history season mismatch");
  const weeks = new Set();
  for (const snapshot of spendHistory.snapshots) {
    assert(Number.isInteger(snapshot.week) && snapshot.week >= 0 && !weeks.has(snapshot.week), "Invalid or duplicate spend snapshot week");
    weeks.add(snapshot.week);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(snapshot.captured_as_of) && /^[a-f0-9]{40}$/.test(snapshot.source_commit), "Spend snapshot needs capture date and source commit");
    assert.equal(snapshot.teams.length, current.teams.length, "Incomplete spend baseline");
    assert.equal(new Set(snapshot.teams.map((team) => team.slug)).size, current.teams.length, "Duplicate spend baseline team");
    for (const team of snapshot.teams) {
      assert(current.teams.some((row) => row.slug === team.slug), `Unknown baseline team: ${team.slug}`);
      assert(Number.isFinite(team.budget_mid_m) && team.budget_mid_m > 0, "Invalid historical budget");
      const rank = 1 + snapshot.teams.filter((row) => row.budget_mid_m > team.budget_mid_m + 1e-9).length;
      assert.equal(team.spend_rank, rank, `Incorrect historical spend rank for ${team.slug}`);
    }
  }
  const baseline = spendHistory.snapshots.find((row) => row.week === previousWeek) ?? null;
  const currentBallot = ballots.get(currentWeek);
  const previousBallot = ballots.get(previousWeek) ?? null;
  for (const team of current.teams) {
    assert.equal(team.ap_rank, currentBallot.find((row) => row.slug === team.slug)?.rank ?? null, `Current AP rank mismatch for ${team.slug}`);
  }
  return {
    season: current.season,
    source: { name: "AP Top 25", url: "https://apnews.com/hub/ap-top-25-college-football-poll" },
    currentPoll: { week: currentWeek, as_of: current.poll.as_of, ballot: currentBallot },
    previousPoll: previousBallot ? { week: previousWeek, as_of: baseline?.poll_as_of ?? null, ballot: previousBallot } : null,
    spendBaseline: baseline ? { week: baseline.week, captured_as_of: baseline.captured_as_of, source_commit: baseline.source_commit } : null,
    // Retain the current book for the next reviewed refresh to archive as an input.
    currentSpend: current.teams.map(({ slug, budget_mid_m, spend_rank }) => ({ slug, budget_mid_m, spend_rank })).sort((a, b) => a.slug.localeCompare(b.slug)),
    teams: current.teams.map((team) => ({
      slug: team.slug,
      ap: rankMovement(team.ap_rank, previousBallot?.find((row) => row.slug === team.slug)?.rank ?? null, previousBallot !== null),
      spend: rankMovement(team.spend_rank, baseline?.teams.find((row) => row.slug === team.slug)?.spend_rank ?? null, baseline !== null),
    })).sort((a, b) => a.slug.localeCompare(b.slug)),
  };
}
