"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import TeamMark from "@/components/TeamMark";
import { data } from "@/lib/data";
import type { TeamBudget } from "@/lib/types";

const teams = [...data.teams].sort((a, b) => a.name.localeCompare(b.name));

export default function TeamSearch({
  open,
  onOpenChange,
  onOpen,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpen?: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const shellRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const listId = useId();
  const results = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return [];
    return teams
      .filter((team) =>
        [team.name, team.abbr, team.slug.replaceAll("-", " ")].some((value) =>
          value.toLowerCase().includes(search)
        )
      )
      .slice(0, 8);
  }, [query]);

  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function outside(event: Event) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (shellRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      onOpenChange(false);
      setQuery("");
      setActiveIndex(0);
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
    };
  }, [open, onOpenChange]);

  function close(restoreFocus = false) {
    onOpenChange(false);
    setQuery("");
    setActiveIndex(0);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }

  function choose(team: TeamBudget) {
    close();
    router.push(`/team/${team.slug}`);
  }

  return (
    <div className="relative shrink-0">
      <div
        ref={shellRef}
        className={`relative flex h-10 shrink-0 items-center overflow-hidden rounded-full transition-[width,background-color] duration-200 ease-[var(--ease-in-out)] motion-reduce:transition-none ${
          open ? "w-[calc(100vw-2rem)] bg-panel sm:w-60" : "w-10"
        }`}
      >
        <button
          ref={triggerRef}
          type="button"
          aria-label={open ? "Close team search" : "Search teams"}
          aria-controls={open ? panelId : undefined}
          aria-expanded={open}
          onClick={() => {
            if (open) close();
            else {
              onOpen?.();
              onOpenChange(true);
            }
          }}
          className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-fog transition-ui hover:bg-panel hover:text-paper"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <circle cx="10.8" cy="10.8" r="6.8" />
            <path d="m16 16 4.5 4.5" />
          </svg>
        </button>
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          role="combobox"
          aria-label="Search teams"
          aria-autocomplete="list"
          aria-controls={open ? listId : undefined}
          aria-expanded={open}
          aria-activedescendant={open && results.length ? `${listId}-${activeIndex}` : undefined}
          aria-hidden={!open}
          disabled={!open}
          autoComplete="off"
          spellCheck={false}
          placeholder="Search teams…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && results.length) {
              event.preventDefault();
              setActiveIndex((index) => (index + 1) % results.length);
            } else if (event.key === "ArrowUp" && results.length) {
              event.preventDefault();
              setActiveIndex((index) => (index - 1 + results.length) % results.length);
            } else if (event.key === "Enter" && results[activeIndex]) {
              event.preventDefault();
              choose(results[activeIndex]);
            } else if (event.key === "Escape") {
              event.preventDefault();
              close(true);
            }
          }}
          className={`team-search-input min-w-0 flex-1 bg-transparent pr-4 text-sm text-paper outline-none placeholder:text-fog transition-opacity duration-100 motion-reduce:transition-none ${
            open ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        />
      </div>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="region"
          aria-label="Team search results"
          className="team-search-results absolute right-0 top-[calc(100%+9px)] z-50 w-[calc(100vw-2rem)] overflow-hidden rounded-b-xl border-x border-b border-line bg-ink text-paper shadow-2xl sm:w-60"
        >
          <ul id={listId} role="listbox" aria-label="Matching teams" className="max-h-80 overflow-y-auto">
            {!query.trim() ? (
              <li className="px-4 py-3 text-sm text-fog">Type a team name or abbreviation.</li>
            ) : results.length === 0 ? (
              <li className="px-4 py-3 text-sm text-fog">No teams found.</li>
            ) : (
              results.map((team, index) => (
                <li key={team.slug} role="presentation">
                  <button
                    id={`${listId}-${index}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    tabIndex={-1}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(team)}
                    className={`no-press flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-panel ${index === activeIndex ? "bg-panel" : ""}`}
                  >
                    <TeamMark slug={team.slug} name={team.name} abbr={team.abbr} color={team.color} size="sm" />
                    <span className="min-w-0 flex-1 truncate font-semibold">{team.name}</span>
                    <span className="text-xs text-fog">{team.conference}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
