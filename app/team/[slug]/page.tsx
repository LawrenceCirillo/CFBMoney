import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllTeamSlugs, getTeamBySlug } from "@/lib/data";
import {
  formatBudgetMid,
  formatBudgetRange,
  formatMillions,
  formatPct,
  formatRank,
  formatRecord,
  formatSigned,
} from "@/lib/format";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllTeamSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const team = getTeamBySlug(slug);
  if (!team) return { title: "Team" };
  return {
    title: team.name,
    description: `${team.name} roster budget, 2025 record, moneyball and CFBD context.`,
  };
}

export default async function TeamPage({ params }: Props) {
  const { slug } = await params;
  const team = getTeamBySlug(slug);
  if (!team) notFound();

  const kn = team.knightNewhouse;
  const portal25 = team.portal["2025"];
  const portal26 = team.portal["2026"];

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <p className="text-sm text-slate">
        <Link href="/spending" className="hover:underline">Teams</Link>
        {" / "}
        <span className="text-obsidian">{team.name}</span>
      </p>
      <header className="mt-4 border-b border-stone pb-8">
        <h1 className="font-display text-4xl font-bold uppercase tracking-tight text-obsidian sm:text-5xl">
          {team.name}
        </h1>
        <p className="mt-2 text-slate">{team.conference}</p>
        <p className="mt-6 font-mono text-3xl font-medium text-obsidian sm:text-4xl">
          {formatBudgetRange(team.budgetMin, team.budgetMax)}
        </p>
        <p className="mt-1 text-xs uppercase tracking-wider text-slate">
          Est. 2026 roster budget · mid {formatBudgetMid(team.budgetMid)}
        </p>
      </header>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="font-display text-lg font-semibold uppercase text-obsidian">
            2025 season
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 font-mono text-sm">
            <div>
              <dt className="text-slate text-xs uppercase">Record</dt>
              <dd className="text-lg">
                {formatRecord(team.record2025.wins, team.record2025.losses)}
              </dd>
            </div>
            <div>
              <dt className="text-slate text-xs uppercase">Conf</dt>
              <dd className="text-lg">
                {formatRecord(team.record2025.confWins ?? null, team.record2025.confLosses ?? null)}
              </dd>
            </div>
            <div>
              <dt className="text-slate text-xs uppercase">Expected wins</dt>
              <dd className="text-lg">{team.moneyball.expectedWins2025.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-slate text-xs uppercase">WAE</dt>
              <dd className="text-lg">{formatSigned(team.moneyball.winsAboveExpected2025)}</dd>
            </div>
            <div>
              <dt className="text-slate text-xs uppercase">$/win (mid)</dt>
              <dd className="text-lg">{formatMillions(team.moneyball.dollarsPerWin2025MidM)}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold uppercase text-obsidian">
            Ratings & recruiting (CFBD)
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 font-mono text-sm">
            <div>
              <dt className="text-slate text-xs uppercase">SP+ 2025</dt>
              <dd>
                {team.ratings.spPlus2025?.toFixed(1) ?? "—"} {formatRank(team.ratings.spRank2025)}
              </dd>
            </div>
            <div>
              <dt className="text-slate text-xs uppercase">FPI 2025</dt>
              <dd>
                {team.ratings.fpi2025?.toFixed(1) ?? "—"} {formatRank(team.ratings.fpiRank2025)}
              </dd>
            </div>
            <div>
              <dt className="text-slate text-xs uppercase">Recruit rank 2025</dt>
              <dd>{formatRank(team.recruiting.rank2025)}</dd>
            </div>
            <div>
              <dt className="text-slate text-xs uppercase">Recruit pts avg</dt>
              <dd>{team.recruiting.pointsAvg2022_2025?.toFixed(1) ?? "—"}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold uppercase text-obsidian">
            Portal quality (CFBD)
          </h2>
          <p className="mt-2 text-xs text-slate">Incoming transfers — avg rating and 4★+ counts.</p>
          <div className="mt-4 space-y-4 text-sm font-mono">
            {portal25 ? (
              <div className="border border-stone p-4">
                <p className="text-xs uppercase text-slate mb-2">2025 cycle</p>
                <p>In: {portal25.transfersIn ?? "—"} · Avg {portal25.avgRating?.toFixed(3) ?? "—"}</p>
                <p className="text-slate">
                  4★: {portal25.stars4 ?? 0} · 5★: {portal25.stars5 ?? 0} · P4 rank{" "}
                  {portal25.rankInP4 ?? "—"}
                </p>
              </div>
            ) : null}
            {portal26 ? (
              <div className="border border-stone p-4">
                <p className="text-xs uppercase text-slate mb-2">2026 cycle</p>
                <p>In: {portal26.transfersIn ?? "—"} · Avg {portal26.avgRating?.toFixed(3) ?? "—"}</p>
                <p className="text-slate">
                  4★: {portal26.stars4 ?? 0} · 5★: {portal26.stars5 ?? 0} · P4 rank{" "}
                  {portal26.rankInP4 ?? "—"}
                </p>
              </div>
            ) : null}
            {!portal25 && !portal26 ? <p>—</p> : null}
          </div>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold uppercase text-obsidian">
            Knight-Newhouse ability to pay
          </h2>
          {kn ? (
            <dl className="mt-4 space-y-2 text-sm font-mono">
              <div className="flex justify-between gap-4 border-b border-stone py-2">
                <dt className="text-slate">Total athletic rev</dt>
                <dd>{formatMillions(kn.totalRevM, 1)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-stone py-2">
                <dt className="text-slate">Football spending</dt>
                <dd>{formatMillions(kn.footballSpendingM, 1)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-stone py-2">
                <dt className="text-slate">Roster mid % of FB spend</dt>
                <dd>{formatPct(kn.rosterAsPctOfFootballSpend)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-stone py-2">
                <dt className="text-slate">Roster mid % of total rev</dt>
                <dd>{formatPct(kn.rosterAsPctOfTotalRev)}</dd>
              </div>
              {kn.url ? (
                <p className="pt-2 text-xs text-slate">
                  <a href={kn.url} className="underline" target="_blank" rel="noopener noreferrer">
                    Knight-Newhouse profile
                  </a>
                  {kn.fy ? ` · FY${kn.fy}` : null}
                </p>
              ) : null}
            </dl>
          ) : (
            <p className="mt-4 text-sm text-slate">
              MFRS not published for this institution (common for private schools and Pitt).
            </p>
          )}
        </section>
      </div>

      {team.notes ? (
        <p className="mt-10 text-xs text-slate border-t border-stone pt-6">{team.notes}</p>
      ) : null}
    </div>
  );
}
