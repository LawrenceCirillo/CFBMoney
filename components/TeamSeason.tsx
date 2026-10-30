import { fmtPollDate } from "@/lib/format";
import type { TeamSeason } from "@/lib/season-snapshot";

function perGame(total: number, games: number): string {
  return games > 0 ? `${(total / games).toFixed(1)} per game` : "Unavailable per game";
}

export function SeasonFigure({ season, year, source, asOf }: {
  season: TeamSeason; year: number; source: string; asOf: string;
}) {
  const count = (n: number) => n.toLocaleString("en-US");
  const margin = season.takeaways - season.giveaways;
  const lines = [
    { label: "Points scored", value: count(season.points_for), sub: perGame(season.points_for, season.games) },
    { label: "Points allowed", value: count(season.points_against), sub: perGame(season.points_against, season.games) },
    { label: "Passing yards", value: count(season.pass_yards), sub: perGame(season.pass_yards, season.games) },
    { label: "Rushing yards", value: count(season.rush_yards), sub: perGame(season.rush_yards, season.games) },
    { label: "Turnover margin", value: margin > 0 ? `+${margin}` : margin < 0 ? `−${Math.abs(margin)}` : "0",
      sub: `${season.takeaways} takeaways, ${season.giveaways} giveaways` },
  ];
  return (
    <section className="mt-12 border-t border-line pt-8" aria-labelledby="totals-heading">
      <h2 id="totals-heading" className="text-xl font-bold">{year} season totals</h2>
      <p className="mt-1 text-sm text-fog">{season.games} games · {source}, as of {fmtPollDate(asOf)}</p>
      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
        {lines.map((line) => (
          <div key={line.label}>
            <dt className="text-sm text-fog">{line.label}</dt>
            <dd className="tnum mt-1 text-3xl font-black tracking-tight">{line.value}</dd>
            <dd className="mt-1 text-xs text-fog">{line.sub}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
