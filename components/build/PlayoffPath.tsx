import TeamMark from "@/components/TeamMark";
import { gameVenue, type ScheduledGame } from "@/lib/simulator";
import { PLAYOFF_ROUNDS } from "@/lib/playoff-path";
import type { TeamBudget } from "@/lib/types";

type Program = Pick<TeamBudget, "slug" | "name" | "abbr" | "color">;
type PathGame = Pick<ScheduledGame, "week" | "stage" | "isHome" | "venue" | "playerSeed" | "opponentSeed" | "result"> & { opponent: Program };

function RoundCard({ label, game, program, status, projected, bye }: {
  label: string; game?: PathGame; program: Program; status: string; projected: boolean; bye: boolean;
}) {
  return (
    <div className="h-full min-w-0 rounded-xl border border-line bg-panel/40 p-4">
      <h4 className="text-xs font-semibold text-fog">{label}</h4>
      {game && !bye ? <>
        <div className="mt-4 flex items-start gap-2 text-sm font-bold">
          <TeamMark {...program} size="sm" />
          <span className="min-w-0 flex-1 break-words">{game.playerSeed ? `#${game.playerSeed} ` : ""}{program.name}</span>
          {game.result && <span className="tnum shrink-0">{game.result.scoreFor}</span>}
        </div>
        <div className="mt-3 flex items-start gap-2 text-sm font-bold">
          <TeamMark {...game.opponent} size="sm" />
          <span className="min-w-0 flex-1 break-words">{game.opponentSeed ? `#${game.opponentSeed} ` : ""}{game.opponent.name}</span>
          {game.result && <span className="tnum shrink-0">{game.result.scoreAgainst}</span>}
        </div>
        <p className="mt-4 text-xs text-fog">{gameVenue(game) === "neutral" ? "Neutral site" : `${gameVenue(game) === "home" ? "Home" : "Away"} · ${game.stage === "fr" ? "higher seed hosts" : "saved venue"}`}</p>
        {projected && <p className="mt-1 text-xs text-fog">Projected opponent</p>}
      </> : bye ? <p className="mt-5 text-sm text-fog">No game or weekly call.</p> : null}
      <p className={`mt-4 text-xs font-semibold ${game?.result ? game.result.won ? "text-status-success" : "text-status-loss" : "text-fog"}`}>{status}</p>
    </div>
  );
}

/** Player results only. Optional future rounds are explicitly projected, never scored. */
export default function PlayoffPath({ games, program, projectedPath = [], legacy = false }: {
  games: PathGame[]; program: Program; projectedPath?: PathGame[]; legacy?: boolean;
}) {
  const post = games.filter((game) => game.stage && game.stage !== "bowl");
  if (post.length === 0) return null;
  const lost = post.some((game) => game.result && !game.result.won);
  const seed = post[0].playerSeed;
  const hasBye = !legacy && seed != null && seed <= 4;
  const rounds = legacy ? PLAYOFF_ROUNDS.filter((round) => round.stage !== "fr") : PLAYOFF_ROUNDS;
  return (
    <section className="mb-10" aria-labelledby="playoff-path-heading">
      <h3 id="playoff-path-heading" className="text-xl font-black tracking-tight sm:text-2xl">Your playoff path</h3>
      <p className="mt-2 text-sm text-fog">{legacy ? "Earlier model · three-round record. These are the games saved at publication." : `Modeled player path${seed ? ` · qualification seed #${seed}` : ""}. Drawn from eligible tracked programs, not the actual national CFP field.`}</p>
      <p className="mt-1 text-xs text-fog">{legacy ? "Only saved player games are shown. Empty rounds were not played under these rules." : "Other bracket games are not simulated. Future opponents are projections or TBD."}</p>
      <ol aria-label="Playoff rounds" className={`mt-5 grid gap-3 ${legacy ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
        {rounds.map(({ stage, label, week }, index) => {
          const actual = post.find((game) => game.stage === stage);
          const projected = projectedPath.find((game) => game.stage === stage);
          const game = actual ?? projected;
          const bye = stage === "fr" && hasBye;
          const status = legacy && !actual ? "Not played · earlier model" : bye ? "First-round bye" : actual?.result
            ? actual.result.won ? stage === "ncg" ? "W · National champions" : "W · Advanced" : "L · Eliminated"
            : lost ? "Run ended · not played" : actual ? "Up next" : "Opponent projected/TBD · win to reach";
          return <li key={stage} className="relative min-w-0" data-path-stage={stage} data-path-week={week}>
            <RoundCard label={label} game={game} program={program} status={status} bye={bye} projected={!actual && !!projected} />
            {index < rounds.length - 1 && <span aria-hidden="true" className="absolute -right-3 top-1/2 z-10 hidden text-fog lg:block">→</span>}
          </li>;
        })}
      </ol>
    </section>
  );
}
