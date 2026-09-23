import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getSeason } from "@/db/seasons";
import { dbEnabled } from "@/db/client";
import { fmtMoney1 } from "@/lib/format";
import { getTeam } from "@/lib/data";
import TeamMark from "@/components/TeamMark";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  let title = "Simulated season · CFB Money";
  let description = "A fan-built college football roster, simulated week by week.";
  if (dbEnabled()) {
    const s = await getSeason(id).catch(() => null);
    if (s) {
      const gm = s.gmName ? ` by ${s.gmName}` : "";
      title = `${s.verified ? "Verified" : "Unverified legacy"} ${s.wins}–${s.losses} ${s.programName}${gm} · CFB Money`;
      description =
        `${s.verified ? "Server-replayed" : "Unverified legacy"} $${s.budgetM}M ${s.programName} roster sim: ${s.wins}–${s.losses} ` +
        `(${s.expectedWins.toFixed(1)} expected). ` +
        (s.bestWin
          ? `Best win: ${s.bestWin.opponent} ${s.bestWin.scoreFor}–${s.bestWin.scoreAgainst}.`
          : "");
    }
  }
  return { title, description };
}

function scoreLine(g: { won: boolean; scoreFor: number; scoreAgainst: number }) {
  return g.won ? (
    <span className="font-black tabular-nums text-emerald-400">
      W {g.scoreFor}–{g.scoreAgainst}
    </span>
  ) : (
    <span className="font-black tabular-nums text-red-400">
      L {g.scoreFor}–{g.scoreAgainst}
    </span>
  );
}

export default async function ShareSeasonPage({ params }: Props) {
  const { id } = await params;

  if (!dbEnabled()) {
    return (
      <div className="mx-auto max-w-2xl py-24 text-center">
        <h1 className="font-display text-3xl font-black text-paper">
          Leaderboard not connected
        </h1>
        <p className="mt-3 text-fog">
          This share link needs the leaderboard database. The site owner can connect it by
          setting <code className="text-paper">DATABASE_URL</code> — see the README.
        </p>
        <Link
          href="/build"
          className="mt-6 inline-block rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-ink hover:bg-emerald-400"
        >
          Sim your own season
        </Link>
      </div>
    );
  }

  const season = await getSeason(id).catch(() => {
    // Next logs this sanitized error once and renders the route error boundary.
    throw new Error("Season data unavailable");
  });
  if (!season) notFound();

  // The honest exam: regular-season wins vs the roster's preseason projection.
  const regGames = season.games.filter((g) => !g.stage);
  const projWins = regGames.reduce((s, g) => s + g.winProb, 0);
  const regWins = regGames.filter((g) => g.won).length;
  const over = regWins - projWins;
  const verdict =
    over > 0.05
      ? `Beat the projection by ${over.toFixed(1)} wins — the build outplayed the money.`
      : over < -0.05
        ? `Missed the projection by ${Math.abs(over).toFixed(1)} wins — bad luck, or a soft build.`
        : "Right on the number. The money never lies.";

  return (
    <div className="mx-auto max-w-3xl py-10 sm:py-14">
      {/* header card */}
      <div className="overflow-hidden rounded-3xl border border-edge bg-panel/60">
        <div className="h-2" style={{ background: season.programColor }} />
        <div className="p-6 sm:p-10">
          <p className="text-xs font-semibold text-fog">
            CFB Money · {season.verified ? "Verified simulated season" : "Legacy simulated season · unverified"}
          </p>
          {season.verified ? (
            <p className="mt-2 text-xs text-emerald-400">
              Server replayed · {season.mode === "season" ? "Season mode" : "Quick sim"} · model v{season.simVersion} · data {season.dataFingerprint}
            </p>
          ) : (
            <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
              Unverified legacy result. This season was published before server replay and is excluded from ranked leaderboards.
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-center gap-3">
              <TeamMark
                slug={season.programSlug}
                name={season.programName}
                abbr={getTeam(season.programSlug)?.abbr ?? season.programName.slice(0, 4)}
                color={season.programColor}
                size="lg"
              />
              <div>
                <h1 className="font-display text-4xl font-black text-paper sm:text-5xl">
                  {season.programName}
                </h1>
                <p className="mt-1 text-sm text-fog">
                  {fmtMoney1(season.budgetM)} roster
                  {season.gmName ? ` · built by ${season.gmName}` : ""} ·{" "}
                  {new Date(season.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
            <p className="font-display text-7xl font-black tabular-nums text-paper">
              {season.wins}–{season.losses}
            </p>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            {[
              { label: "Projected wins", value: projWins.toFixed(1) },
              {
                label: "Avg margin",
                value: `${season.avgMargin > 0 ? "+" : ""}${season.avgMargin.toFixed(1)}`,
              },
              {
                label: "Roster rating",
                value: Math.round((season.off + season.def) / 2).toString(),
              },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-ink/60 p-4">
                <p className="text-[11px] font-semibold text-fog">{s.label}</p>
                <p className="font-display mt-1 text-2xl font-black tabular-nums text-paper">
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-5 text-sm text-fog">{verdict}</p>

          {season.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {season.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-line px-3 py-1 text-xs font-semibold text-paper"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* best / worst */}
      {(season.bestWin || season.worstLoss) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {season.bestWin && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
              <p className="text-[11px] font-semibold text-emerald-500">Best win</p>
              <p className="mt-1 font-semibold text-paper">
                {season.bestWin.opponent}{" "}
                <span className="tabular-nums text-fog">
                  {season.bestWin.scoreFor}–{season.bestWin.scoreAgainst}
                </span>
              </p>
            </div>
          )}
          {season.worstLoss && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
              <p className="text-[11px] font-semibold text-red-400">Worst loss</p>
              <p className="mt-1 font-semibold text-paper">
                {season.worstLoss.opponent}{" "}
                <span className="tabular-nums text-fog">
                  {season.worstLoss.scoreFor}–{season.worstLoss.scoreAgainst}
                </span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* roster spend */}
      <div className="mt-4 rounded-2xl border border-edge bg-panel/40 p-6">
        <p className="text-[11px] font-semibold text-fog">
          Where the ${season.budgetM}M went
        </p>
        <div className="mt-4 space-y-2.5">
          {(
            Object.entries(season.alloc) as [string, number][]
          )
            .sort((a, b) => b[1] - a[1])
            .map(([pos, spend]) => (
              <div key={pos} className="flex items-center gap-3">
                <span className="w-8 text-xs font-bold text-fog">{pos}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(spend / season.budgetM) * 100}%`,
                      background: season.programColor,
                    }}
                  />
                </div>
                <span className="w-14 text-right text-xs tabular-nums text-fog">
                  {fmtMoney1(spend)}
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* game log */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-edge">
        <p className="border-b border-line bg-panel/60 px-5 py-3 text-[11px] font-semibold text-fog">
          Game log
        </p>
        {season.games.map((g) => (
          <div
            key={g.week}
            className="flex items-center gap-4 border-b border-line/60 px-5 py-3 last:border-0"
          >
            <span className="w-12 shrink-0 text-xs font-semibold text-fog">
              {g.stage === "qf"
                ? "QF"
                : g.stage === "sf"
                  ? "SF"
                  : g.stage === "ncg"
                    ? "NCG"
                    : g.stage === "bowl"
                      ? "Bowl"
                      : `Wk ${g.week}`}
            </span>
            <TeamMark
              slug={g.oppSlug}
              name={g.oppName}
              abbr={getTeam(g.oppSlug)?.abbr ?? g.oppName.slice(0, 4)}
              color={g.oppColor}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-paper">
                <span className="mr-2 text-xs font-normal text-fog">
                  {g.isHome ? "vs" : "at"}
                </span>
                {g.oppName}
              </p>
              <p className="text-xs text-fog">{Math.round(g.winProb * 100)}% to win</p>
            </div>
            {scoreLine(g)}
          </div>
        ))}
      </div>

      {/* CTAs */}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/build"
          className="rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-ink transition-ui hover:bg-emerald-400"
        >
          Build your own roster
        </Link>
        <Link
          href="/leaderboard"
          className="rounded-xl border border-edge px-6 py-3 text-sm font-semibold text-paper transition-ui hover:border-fog hover:text-paper"
        >
          Leaderboard
        </Link>
      </div>
    </div>
  );
}
