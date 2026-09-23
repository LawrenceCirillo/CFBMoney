"use client";

import Link from "next/link";
import { useState } from "react";
import TeamMark from "@/components/TeamMark";
import { getTeam } from "@/lib/data";
import { scoreboard, type ScoreGame, type ScoreSide } from "@/lib/scores";

function Side({ side, dim }: { side: ScoreSide; dim: boolean }) {
  const team = side.slug ? getTeam(side.slug) : undefined;
  const body = (
    <span className={`flex items-center gap-1.5 ${dim ? "opacity-50" : ""}`}>
      {team ? (
        <TeamMark slug={team.slug} name={team.name} abbr={team.abbr} color={team.color} size="sm" />
      ) : (
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink/10 text-[8px] font-black tracking-tight">
          {side.abbr.slice(0, 3)}
        </span>
      )}
      <span className="text-xs font-semibold">
        {side.rank != null ? <span className="tnum mr-1 font-bold">#{side.rank}</span> : null}
        {side.abbr}
      </span>
      <span className={`tnum text-sm ${dim ? "font-semibold" : "font-black"}`}>{side.score}</span>
    </span>
  );

  if (!side.slug) return body;
  return (
    <Link href={`/team/${side.slug}`} className="rounded-sm hover:opacity-80">
      {body}
    </Link>
  );
}

function GameChip({ game }: { game: ScoreGame }) {
  const split = game.away.winner !== game.home.winner;
  return (
    <div className="flex shrink-0 items-center gap-3 whitespace-nowrap border-r border-ink/15 px-4">
      <Side side={game.away} dim={split && !game.away.winner} />
      <span className="text-[11px] text-ink/45">at</span>
      <Side side={game.home} dim={split && !game.home.winner} />
    </div>
  );
}

function GameRun({ games, hidden }: { games: ScoreGame[]; hidden?: boolean }) {
  return (
    <div className="flex h-11 items-center" inert={hidden ? true : undefined} aria-hidden={hidden || undefined}>
      {games.map((game) => (
        <GameChip key={hidden ? `${game.id}-copy` : game.id} game={game} />
      ))}
    </div>
  );
}

export default function ScoreTicker() {
  const [paused, setPaused] = useState(false);
  const games = scoreboard.games;
  if (games.length === 0) return null;

  return (
    <div className="score-ticker flex h-11 border-b border-ink/15 bg-paper text-ink" data-paused={paused}>
      <div className="z-10 flex shrink-0 items-center gap-2 border-r border-ink/15 bg-paper px-4">
        <span className="text-xs font-black tracking-tight">{scoreboard.label}</span>
        <span className="hidden text-xs text-ink/55 sm:inline">{scoreboard.range}</span>
        <button
          type="button"
          aria-label={paused ? "Play scores" : "Pause scores"}
          onClick={() => setPaused((value) => !value)}
          className="score-ticker-motion -my-px flex min-h-11 items-center rounded px-1 text-xs font-semibold text-ink/70 hover:text-ink focus-visible:text-ink"
        >
          {paused ? "Play" : "Pause"}
        </button>
      </div>
      <div
        className="score-ticker-window min-w-0 flex-1 overflow-hidden"
        role="region"
        aria-label={`${scoreboard.label} scores, ${scoreboard.range}`}
      >
        <div className="score-ticker-track flex w-max">
          <GameRun games={games} />
          <GameRun games={games} hidden />
        </div>
      </div>
    </div>
  );
}
