"use client";

import Link from "next/link";
import { useState } from "react";
import { data, getTeam } from "@/lib/data";
import { scoreboard, type ScoreGame, type ScoreSide } from "@/lib/scores";
import { useSeasonTicker, type SeasonTickerGame } from "@/components/SeasonTickerContext";

const spriteColumns = 8;
const spriteCell = 24;
const spriteRows = Math.ceil(data.teams.length / spriteColumns);
const spritePositions = new Map(
  data.teams.map((team) => team.slug).sort().map((slug, index) => [slug, index])
);

function TickerMark({ slug }: { slug: string }) {
  const index = spritePositions.get(slug);
  if (index == null) return null;
  return (
    <span
      aria-hidden="true"
      className="score-ticker-mark inline-block h-6 w-6 shrink-0"
      style={{
        backgroundImage: 'url("/marks/ticker.webp")',
        backgroundSize: `${spriteColumns * spriteCell}px ${spriteRows * spriteCell}px`,
        backgroundPosition: `-${(index % spriteColumns) * spriteCell}px -${Math.floor(index / spriteColumns) * spriteCell}px`,
      }}
    />
  );
}

function Side({ side, dim }: { side: ScoreSide; dim: boolean }) {
  const team = side.slug ? getTeam(side.slug) : undefined;
  const body = (
    <span className={`flex items-center gap-1.5 ${dim ? "opacity-50" : ""}`}>
      {team ? (
        <TickerMark slug={team.slug} />
      ) : (
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-[8px] font-black tracking-tight text-ink/70">
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

function SeasonGameChip({ game, programSlug, programAbbr, current }: {
  game: SeasonTickerGame;
  programSlug: string;
  programAbbr: string;
  current: boolean;
}) {
  const played = game.scoreFor != null && game.scoreAgainst != null;
  const yours = (
    <Link href={`/team/${programSlug}`} className="flex items-center gap-1.5 rounded-sm hover:opacity-80">
      <TickerMark slug={programSlug} />
      <span className="text-xs font-bold">{programAbbr}</span>
      {played && <span className="tnum text-sm font-black">{game.scoreFor}</span>}
    </Link>
  );
  const theirs = (
    <Link href={`/team/${game.opponentSlug}`} className="flex items-center gap-1.5 rounded-sm hover:opacity-80">
      <TickerMark slug={game.opponentSlug} />
      <span className="text-xs font-bold">{game.opponentAbbr}</span>
      {played && <span className="tnum text-sm font-black">{game.scoreAgainst}</span>}
    </Link>
  );
  return (
    <div data-season-week={game.week} className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap border-r border-ink/15 px-4 ${current ? "bg-ink/10" : ""}`}>
      <span className="text-[10px] font-black uppercase tracking-wide text-ink/55">{game.stage ?? `W${game.week}`}</span>
      {game.isHome ? theirs : yours}
      <span className="text-[11px] text-ink/45">at</span>
      {game.isHome ? yours : theirs}
      <span className={`text-[10px] font-black ${played ? game.won ? "text-emerald-700" : "text-red-700" : "text-ink/50"}`}>
        {played ? game.won ? "W" : "L" : current ? "NEXT" : ""}
      </span>
    </div>
  );
}

export default function ScoreTicker() {
  const [paused, setPaused] = useState(false);
  const { season } = useSeasonTicker();
  if (season) {
    const current = season.games[season.featured];
    const stageLabel: Record<string, string> = { qf: "Quarterfinal", sf: "Semifinal", ncg: "Championship", bowl: "Bowl" };
    const range = season.done ? "Final" : `Week ${current?.week ?? 1}${current?.stage ? ` · ${stageLabel[current.stage]}` : ""}`;
    const ordered = season.games;
    const played = season.games.filter((game) => game.scoreFor != null).length;
    return (
      <div className="score-ticker flex h-11 border-b border-ink/15 bg-paper text-ink" data-paused={paused}>
        <div className="z-10 flex shrink-0 items-center gap-2 border-r border-ink/15 bg-paper px-4">
          <span className="text-xs font-black tracking-tight">Your season</span>
          <span className="text-xs text-ink/55">{range}</span>
          <button type="button" aria-label={paused ? "Play scores" : "Pause scores"}
            onClick={() => setPaused((value) => !value)}
            className="score-ticker-motion -my-px flex min-h-11 items-center rounded px-1 text-xs font-semibold text-ink/70 hover:text-ink focus-visible:text-ink">
            {paused ? "Play" : "Pause"}
          </button>
        </div>
        <div className="score-ticker-window min-w-0 flex-1 overflow-hidden" role="region" aria-label={`Your season scores, ${range}`}>
          <div key={`${season.programSlug}-${played}-${season.featured}`} className="score-ticker-track flex w-max">
            {[false, true].map((hidden) => (
              <div key={String(hidden)} className="flex h-11 items-center" inert={hidden ? true : undefined} aria-hidden={hidden || undefined}>
                {ordered.map((game, index) => (
                  <SeasonGameChip key={`${hidden}-${game.week}-${game.stage ?? "reg"}`} game={game}
                    programSlug={season.programSlug} programAbbr={season.programAbbr} current={index === season.featured} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
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
