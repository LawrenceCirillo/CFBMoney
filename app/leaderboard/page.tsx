import Link from "next/link";
import type { Metadata } from "next";
import { getLeaderboard, getLegacyArchive, countSeasons, type LeaderboardSort } from "@/db/seasons";
import { dbEnabled } from "@/db/client";
import { fmtMoney1 } from "@/lib/format";
import { getTeam } from "@/lib/data";
import TeamMark from "@/components/TeamMark";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leaderboard · CFB Money",
  description: "The best fan-built roster seasons, ranked by wins and overachievement.",
};

type Props = { searchParams: Promise<{ sort?: string; archivePage?: string }> };

const SORTS: { key: LeaderboardSort; label: string }[] = [
  { key: "overachieve", label: "Biggest overachievers" },
  { key: "wins", label: "Most wins" },
];

function medal(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return <span className="text-fog">{rank}</span>;
}

export default async function LeaderboardPage({ searchParams }: Props) {
  const sp = await searchParams;
  const sort: LeaderboardSort = sp.sort === "wins" ? "wins" : "overachieve";
  const pageNumber = Number(sp.archivePage);
  const archivePage = Number.isSafeInteger(pageNumber) && pageNumber > 1 && pageNumber <= 1_000_000 ? pageNumber : 1;
  const archivePageSize = 50;

  if (!dbEnabled()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <h1 className="font-display text-4xl font-black text-paper">Leaderboard</h1>
        <p className="mt-4 text-fog">
          The leaderboard needs a database. The site owner can connect one in about two
          minutes: create a free Postgres database (e.g. Neon), set{" "}
          <code className="rounded bg-line px-1.5 py-0.5 text-sm text-paper">
            DATABASE_URL
          </code>
          , run <code className="rounded bg-line px-1.5 py-0.5 text-sm text-paper">
            npm run db:migrate
          </code>{" "}
          and redeploy. Details are in the README.
        </p>
        <Link
          href="/build"
          className="mt-6 inline-block rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-ink hover:bg-emerald-400"
        >
          Sim a season anyway
        </Link>
      </div>
    );
  }

  const [rows, total, legacyRows, legacyTotal] = await Promise.all([
    getLeaderboard(sort),
    countSeasons(),
    getLegacyArchive(archivePageSize, (archivePage - 1) * archivePageSize),
    countSeasons(false),
  ]).catch(() => {
    // Keep driver details and connection strings out of the rendered error.
    throw new Error("Leaderboard data unavailable");
  });

  return (
    <div className="mx-auto max-w-5xl py-10 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-fog">
            {total} verified season{total === 1 ? "" : "s"} published
          </p>
          <h1 className="font-display mt-1 text-4xl font-black text-paper sm:text-5xl">
            Leaderboard
          </h1>
          <p className="mt-2 max-w-xl text-sm text-fog">
            Ranked results use the current game model and are replayed by the server from the published roster, seed, and weekly calls.
            Exp. covers every game played, including postseason. Click any season for the full game log.
          </p>
        </div>
        <div className="flex gap-2">
          {SORTS.map((s) => (
            <Link
              key={s.key}
              href={`/leaderboard?sort=${s.key}`}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-ui ${
                sort === s.key
                  ? "bg-emerald-500 text-ink"
                  : "border border-line text-paper hover:border-fog"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {rows.length === 0 && total === 0 ? (
        <div className="mt-12 rounded-3xl border border-dashed border-edge p-12 text-center">
          <p className="font-display text-2xl font-bold text-paper">No verified seasons yet</p>
          <p className="mx-auto mt-2 max-w-md text-pretty text-sm text-fog">
            {legacyTotal > 0
              ? `${legacyTotal} earlier season${legacyTotal === 1 ? " is" : "s are"} available in the unranked archive below.`
              : "Build a roster and publish a season to get started."}
          </p>
          <Link
            href="/build"
            className="mt-6 inline-block rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-ink hover:bg-emerald-400"
          >
            Build a roster
          </Link>
        </div>
      ) : (
        <>
          <ol className="mt-8 space-y-3 md:hidden" aria-label={`${SORTS.find((item) => item.key === sort)?.label} leaderboard`}>
            {rows.map((r, i) => {
              const diff = r.wins - r.expectedWins;
              const diffColor = diff > 0.5
                ? "text-status-success"
                : diff < -0.5
                  ? "text-status-loss"
                  : "text-fog";
              return (
                <li key={r.id}>
                  <Link href={`/s/${r.id}`} className="block rounded-2xl border border-edge bg-panel/40 p-4 transition-ui hover:border-fog focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper">
                    <div className="flex items-start gap-3">
                      <span className="w-7 shrink-0 text-center text-lg" aria-label={`Rank ${i + 1}`}>{medal(i + 1)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold text-paper">{r.gmName || "Anonymous"}</p>
                        <span className="mt-1 flex items-center gap-2 text-sm text-fog">
                          <TeamMark
                            slug={r.programSlug}
                            name={r.programName}
                            abbr={getTeam(r.programSlug)?.abbr ?? r.programName.slice(0, 4)}
                            color={r.programColor}
                            size="sm"
                          />
                          <span className="min-w-0 break-words">{r.programName}</span>
                        </span>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[11px] font-semibold text-fog">{sort === "overachieve" ? "+/− wins" : "Record"}</p>
                        <p className={`font-display whitespace-nowrap text-2xl font-black tabular-nums ${sort === "overachieve" ? diffColor : "text-paper"}`}>
                          {sort === "overachieve" ? `${diff > 0 ? "+" : ""}${diff.toFixed(1)}` : `${r.wins}–${r.losses}`}
                        </p>
                      </div>
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-sm">
                      <div>
                        <dt className="text-[11px] text-fog">{sort === "overachieve" ? "Record" : "+/− wins"}</dt>
                        <dd className={`mt-0.5 whitespace-nowrap font-bold tabular-nums ${sort === "overachieve" ? "text-paper" : diffColor}`}>
                          {sort === "overachieve" ? `${r.wins}–${r.losses}` : `${diff > 0 ? "+" : ""}${diff.toFixed(1)}`}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-fog">Exp.</dt>
                        <dd className="mt-0.5 whitespace-nowrap font-bold tabular-nums text-paper">{r.expectedWins.toFixed(1)}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-fog">Book</dt>
                        <dd className="mt-0.5 whitespace-nowrap font-bold tabular-nums text-paper">{fmtMoney1(r.budgetM)}</dd>
                      </div>
                    </dl>
                    <p className="mt-3 text-xs leading-relaxed text-fog">
                      Best win: {r.bestWin ? `${r.bestWin.opponent} ${r.bestWin.scoreFor}–${r.bestWin.scoreAgainst}` : "—"}
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      {new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ol>
          <div className="mt-8 hidden overflow-x-auto rounded-2xl border border-edge md:block">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-panel/60 text-[11px] font-semibold text-fog">
                <th className="px-4 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">GM</th>
                <th className="px-4 py-3 font-semibold">Program</th>
                <th className="px-4 py-3 text-right font-semibold">Book</th>
                <th className="px-4 py-3 text-right font-semibold">Record</th>
                <th className="px-4 py-3 text-right font-semibold">Exp.</th>
                <th className="px-4 py-3 text-right font-semibold">+/−</th>
                <th className="px-4 py-3 font-semibold">Best win</th>
                <th className="px-4 py-3 text-right font-semibold">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const diff = r.wins - r.expectedWins;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-line/60 transition-ui last:border-0 hover:bg-panel/60"
                  >
                    <td className="px-4 py-3.5 text-lg">{medal(i + 1)}</td>
                    <td className="px-4 py-3.5 font-semibold text-paper">
                      <Link href={`/s/${r.id}`} className="hover:text-paper hover:underline">
                        {r.gmName || <span className="text-fog">Anonymous</span>}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-2">
                        <TeamMark
                          slug={r.programSlug}
                          name={r.programName}
                          abbr={getTeam(r.programSlug)?.abbr ?? r.programName.slice(0, 4)}
                          color={r.programColor}
                          size="sm"
                        />
                        <span className="font-medium text-paper">{r.programName}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-fog">
                      {fmtMoney1(r.budgetM)}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Link
                        href={`/s/${r.id}`}
                        className="font-display text-lg font-black tabular-nums text-paper hover:underline"
                      >
                        {r.wins}–{r.losses}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-fog">
                      {r.expectedWins.toFixed(1)}
                    </td>
                    <td
                      className={`px-4 py-3.5 text-right font-bold tabular-nums ${
                        diff > 0.5
                          ? "text-status-success"
                          : diff < -0.5
                            ? "text-status-loss"
                            : "text-fog"
                      }`}
                    >
                      {diff > 0 ? "+" : ""}
                      {diff.toFixed(1)}
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-3.5 text-fog">
                      {r.bestWin
                        ? `${r.bestWin.opponent} ${r.bestWin.scoreFor}–${r.bestWin.scoreAgainst}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-right text-xs text-fog">
                      {new Date(r.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </>
      )}

      {legacyTotal > 0 && (
        <section className="mt-12 border-t border-line pt-8" aria-labelledby="legacy-heading">
          <h2 id="legacy-heading" className="font-display text-2xl font-bold text-paper">Earlier seasons · unranked archive</h2>
          <p className="mt-2 text-sm text-fog">
            {legacyTotal} season{legacyTotal === 1 ? "" : "s"} published under earlier rules or before server replay.
            Their recaps remain available; rankings compare seasons played under the current rules.
          </p>
          <ul className="mt-5 space-y-2">
            {legacyRows.map((row) => (
              <li key={row.id}>
                <Link href={`/s/${row.id}`} className="flex flex-wrap justify-between gap-2 rounded-xl border border-edge px-4 py-3 text-sm text-paper hover:border-fog">
                  <span>{row.gmName || "Anonymous"} · {row.programName}</span>
                  <span className="tabular-nums text-fog">{row.wins}–{row.losses} · {row.verified ? `verified model v${row.simVersion}` : "unverified"}</span>
                </Link>
              </li>
            ))}
          </ul>
          {legacyTotal > archivePageSize && (
            <nav className="mt-5 flex items-center gap-4 text-sm" aria-label="Archive pages">
              {archivePage > 1 && (
                <Link href={`/leaderboard?sort=${sort}&archivePage=${archivePage - 1}`} className="text-paper underline">Previous</Link>
              )}
              <span className="text-fog">Page {archivePage} of {Math.ceil(legacyTotal / archivePageSize)}</span>
              {archivePage * archivePageSize < legacyTotal && (
                <Link href={`/leaderboard?sort=${sort}&archivePage=${archivePage + 1}`} className="text-paper underline">Next</Link>
              )}
            </nav>
          )}
        </section>
      )}

      <div className="mt-8 text-center">
        <Link
          href="/build"
          className="inline-block rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-ink transition-ui hover:bg-emerald-400"
        >
          Put your roster on the board
        </Link>
      </div>
    </div>
  );
}
