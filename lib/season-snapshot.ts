import raw from "../data/espn-season-2026.json";

export type RosterSide = "offense" | "defense" | "special" | "injured" | "suspended" | "practice";

export interface RosterPlayer {
  name: string;
  jersey: string;
  pos: string;
  year: string;
  side: RosterSide;
}

export interface TeamSeason {
  record: string;
  games: number;
  points_for: number;
  points_against: number;
  pass_yards: number;
  rush_yards: number;
  takeaways: number;
  giveaways: number;
  roster: RosterPlayer[];
}

export interface SeasonSnapshot {
  source: string;
  url: string;
  as_of: string;
  season: number;
  note: string;
  teams: Record<string, TeamSeason>;
}

export const seasonSnapshot = raw as SeasonSnapshot;

export function getTeamSeason(slug: string): TeamSeason | undefined {
  return seasonSnapshot.teams[slug];
}
