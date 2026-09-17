"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { Team } from "@/lib/types";

type Props = { teams: Team[] };

export function TeamSearch({ teams }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    return teams
      .filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.conference.toLowerCase().includes(q) ||
          t.slug.includes(q.replace(/\s+/g, "-")),
      )
      .slice(0, 8);
  }, [teams, query]);

  return (
    <div ref={wrapRef} className="relative w-full max-w-xs">
      <label htmlFor="team-search" className="sr-only">
        Search teams, conferences
      </label>
      <input
        id="team-search"
        type="search"
        value={query}
        placeholder="Search teams, conferences"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 150);
        }}
        className="w-full border border-stone bg-white px-3 py-1.5 text-sm text-obsidian placeholder:text-slate"
      />
      {open && results.length > 0 ? (
        <ul className="absolute right-0 z-20 mt-1 w-full overflow-hidden rounded-xl border border-stone bg-white py-1 shadow-sm">
          {results.map((team) => (
            <li key={team.slug}>
              <Link
                href={`/team/${team.slug}`}
                className="flex items-baseline justify-between gap-2 px-3 py-1.5 text-sm hover:bg-stone/40"
                onClick={() => {
                  setQuery("");
                  setOpen(false);
                }}
              >
                <span className="text-obsidian">{team.name}</span>
                <span className="text-[10px] uppercase tracking-wider text-slate">
                  {team.conference}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
