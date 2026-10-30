"use client";

import { useId, useMemo, useState } from "react";
import { fmtPollDate } from "@/lib/format";
import { groupRoster, type DisplayPlayer } from "@/lib/roster-display";

export default function TeamRoster({ roster, source, asOf }: {
  roster: DisplayPlayer[]; source: string; asOf: string;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const filtering = query.trim().length > 0;
  const units = useMemo(() => groupRoster(roster, query), [roster, query]);
  const groups = units.flatMap((unit) => unit.groups);
  const matches = groups.reduce((sum, group) => sum + group.players.length, 0);
  const allOpen = groups.length > 0 && groups.every((group) => openGroups.has(group.key));
  const focus = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-paper";

  function toggle(key: string) {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <section className="mt-14 border-t border-line pt-8" aria-labelledby={`${id}-heading`} data-team-roster>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${id}-heading`} className="text-2xl font-bold">Roster</h2>
        <p className="text-xs text-fog">{source} · {fmtPollDate(asOf)}</p>
      </div>
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div className="w-full sm:max-w-sm">
          <label htmlFor={`${id}-search`} className="mb-2 block text-sm font-semibold">Find a player by name</label>
          <input id={`${id}-search`} type="search" value={query} onChange={(event) => setQuery(event.target.value)}
            aria-describedby={`${id}-count`} placeholder="Player name" autoComplete="off"
            className={`w-full rounded-xl border border-edge bg-panel/60 px-4 py-3 text-base text-paper placeholder:text-fog ${focus}`} />
        </div>
        {filtering && <button type="button" onClick={() => { setQuery(""); document.getElementById(`${id}-search`)?.focus(); }}
          className={`rounded-full bg-panel px-4 py-2 text-sm font-semibold ${focus}`}>Clear search</button>}
        <button type="button" disabled={filtering || groups.length === 0}
          onClick={() => setOpenGroups(allOpen ? new Set() : new Set(groups.map((group) => group.key)))}
          className={`rounded-full bg-panel px-4 py-2 text-sm font-semibold disabled:opacity-50 ${focus}`}>
          {allOpen ? "Collapse all groups" : "Expand all groups"}
        </button>
      </div>
      <p id={`${id}-count`} role="status" className="mt-3 text-sm text-fog">
        {filtering ? `${matches} matching ${matches === 1 ? "player" : "players"} of ${roster.length}` : `${roster.length} players`}
        {filtering ? " · Matching groups are expanded." : " · Open a position group to explore."}
      </p>
      {matches === 0 && <p className="mt-6 text-paper">No players match “{query}”. Try another name or clear the search.</p>}
      <div className="mt-6 space-y-6">
        {units.map((unit) => (
          <div key={unit.key}>
            <h3 className="mb-2 text-sm font-bold text-fog">{unit.label} <span className="tnum font-normal">· {unit.total}</span></h3>
            <div className="overflow-hidden rounded-xl border border-edge">
              {unit.groups.map((group) => {
                const expanded = filtering || openGroups.has(group.key);
                const panelId = `${id}-${encodeURIComponent(group.key)}`;
                return (
                  <div key={group.key} className="border-b border-line last:border-0">
                    <button type="button" aria-expanded={expanded} aria-controls={panelId} disabled={filtering}
                      onClick={() => toggle(group.key)}
                      className="flex min-h-12 w-full items-center justify-between gap-3 bg-panel/40 px-3 py-3 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-paper sm:px-4">
                      <span>{group.label} <span className="tnum ml-2 font-normal text-fog">{filtering ? `${group.players.length} of ${group.total}` : group.total}</span></span>
                      <span aria-hidden="true" className="text-fog">{expanded ? "−" : "+"}</span>
                    </button>
                    <div id={panelId} hidden={!expanded}>
                      <table className="w-full table-fixed text-left text-sm">
                        <colgroup><col className="w-10 sm:w-14" /><col /><col className="w-10 sm:w-14" /><col className="w-10 sm:w-14" /></colgroup>
                        <thead className="text-xs text-fog"><tr>
                          <th scope="col" className="px-2 py-2 text-right font-normal">#</th>
                          <th scope="col" className="px-2 py-2 font-normal">Player</th>
                          <th scope="col" className="px-1 py-2 font-normal">Pos</th>
                          <th scope="col" className="px-1 py-2 font-normal">Year</th>
                        </tr></thead>
                        <tbody>{group.players.map(({ key, player }) => (
                          <tr key={key} className="border-t border-line/60" data-roster-player>
                            <td className="tnum px-2 py-3 text-right align-top text-fog">{player.jersey || "—"}</td>
                            <th scope="row" className="break-words px-2 py-3 align-top font-semibold">{player.name}</th>
                            <td className="break-words px-1 py-3 align-top text-fog">{player.pos || "—"}</td>
                            <td className="break-words px-1 py-3 align-top text-fog">{player.year || "—"}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
