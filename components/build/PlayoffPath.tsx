import TeamMark from "@/components/TeamMark";
import type { ScheduledGame } from "@/lib/simulator";
import type { TeamBudget } from "@/lib/types";

const ROUNDS = [
  { stage: "qf", label: "Quarterfinal" },
  { stage: "sf", label: "Semifinal" },
  { stage: "ncg", label: "National championship" },
] as const;

function RoundCard({ label, game, program, status }: {
  label: string;
  game?: ScheduledGame;
  program: TeamBudget;
  status: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-panel/40 p-4">
      <p className="text-xs font-semibold text-fog">{label}</p>
      {game ? (
        <>
          <div className="mt-4 flex items-center gap-2 text-sm font-bold">
            <TeamMark slug={program.slug} name={program.name} abbr={program.abbr} color={program.color} size="sm" />
            <span className="min-w-0 truncate">{program.name}</span>
            <span className={`tnum ml-auto shrink-0 ${game.result?.won ? "text-status-success" : ""}`}>
              {game.result?.scoreFor ?? "—"}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm font-bold">
            <TeamMark slug={game.opponent.slug} name={game.opponent.name} abbr={game.opponent.abbr} color={game.opponent.color} size="sm" />
            <span className="min-w-0 truncate">{game.opponent.name}</span>
            <span className={`tnum ml-auto shrink-0 ${game.result && !game.result.won ? "text-status-loss" : ""}`}>
              {game.result?.scoreAgainst ?? "—"}
            </span>
          </div>
          <p className="mt-4 text-xs font-semibold text-fog">{status}</p>
        </>
      ) : (
        <p className="mt-5 text-sm text-fog">{status}</p>
      )}
    </div>
  );
}

/** The user-controlled slice of the playoff; other field games are not simulated. */
export default function PlayoffPath({ games, program }: { games: ScheduledGame[]; program: TeamBudget }) {
  const hasPlayoff = games.some((game) => game.stage === "qf" || game.stage === "sf" || game.stage === "ncg");
  if (!hasPlayoff) return null;

  const lost = games.some((game) => game.stage && game.stage !== "bowl" && game.result && !game.result.won);
  const hasBye = !games.some((game) => game.stage === "qf");

  return (
    <section className="mb-10" aria-labelledby="playoff-path-heading">
      <h3 id="playoff-path-heading" className="text-xl font-black tracking-tight sm:text-2xl">Your playoff path</h3>
      <p className="mt-2 text-sm text-fog">Follow the rounds your team reaches. Other bracket games are not simulated.</p>
      <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
        {ROUNDS.map(({ stage, label }, index) => {
          const game = games.find((entry) => entry.stage === stage);
          const status = game?.result
            ? game.result.won ? stage === "ncg" ? "National champions" : "Advanced" : "Eliminated"
            : game ? "Up next" : stage === "qf" && hasBye
              ? "First-round bye" : lost ? "Run ended" : "Win to advance";
          return (
            <div key={stage} className="contents">
              {index > 0 ? <span aria-hidden="true" className="hidden text-xl text-fog md:block">→</span> : null}
              <RoundCard label={label} game={game} program={program} status={status} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
