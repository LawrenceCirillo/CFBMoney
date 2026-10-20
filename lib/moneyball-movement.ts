export interface RankMovement {
  currentRank: number | null;
  previousRank: number | null;
  change: number | null;
  status: "up" | "down" | "unchanged" | "entered" | "dropped" | "unranked" | "unavailable";
}

export interface TeamMovement {
  slug: string;
  ap: RankMovement;
  spend: RankMovement;
}

export interface MoneyballHistory {
  season: number;
  currentPoll: { week: number; as_of: string; ballot: { name: string; slug: string | null; rank: number }[] };
  previousPoll: { week: number; as_of: string | null; ballot: { name: string; slug: string | null; rank: number }[] } | null;
  spendBaseline: { week: number; captured_as_of: string; source_commit: string } | null;
  teams: TeamMovement[];
}

export function movementLabel(movement: RankMovement): string {
  switch (movement.status) {
    case "up": return `up ${movement.change}`;
    case "down": return `down ${Math.abs(movement.change!)}`;
    case "entered": return "new to Top 25";
    case "dropped": return "out of Top 25";
    case "unchanged": return "unchanged";
    case "unranked": return "unranked";
    case "unavailable": return "comparison unavailable";
  }
}

export function comparisonLabel(week: number | null): string {
  return week == null ? "No previous saved poll" : week === 0 ? "Since preseason" : `Since Week ${week}`;
}

export function movementSummary(movement: TeamMovement, previousWeek: number | null): string {
  return `AP ${movementLabel(movement.ap)}; spend ${movementLabel(movement.spend)}. ${comparisonLabel(previousWeek)}.`;
}
