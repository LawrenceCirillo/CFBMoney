import raw from "../data/espn-scores-2026.json";

export interface ScoreSide {
  slug: string | null;
  abbr: string;
  name: string;
  score: number;
  winner: boolean;
  rank: number | null;
}

export interface ScoreGame {
  id: string;
  date: string;
  final: true;
  away: ScoreSide;
  home: ScoreSide;
}

export interface Scoreboard {
  source: string;
  url: string;
  as_of: string;
  season: number;
  week: number;
  label: string;
  range: string;
  note: string;
  games: ScoreGame[];
}

export const scoreboard = raw as Scoreboard;

export interface WeekLine {
  label: string;
  won: boolean | null;
}

function lineFor(side: ScoreSide, other: ScoreSide): WeekLine {
  const won = side.winner ? true : other.winner ? false : null;
  const mark = won === true ? "W" : won === false ? "L" : "T";
  return { label: `${mark} ${side.score}–${other.score}`, won };
}

const weekLines = new Map<string, WeekLine>();
for (const game of scoreboard.games) {
  if (game.away.slug) weekLines.set(game.away.slug, lineFor(game.away, game.home));
  if (game.home.slug) weekLines.set(game.home.slug, lineFor(game.home, game.away));
}

export function weekLine(slug: string): WeekLine | undefined {
  return weekLines.get(slug);
}
