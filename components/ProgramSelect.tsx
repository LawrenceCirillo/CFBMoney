"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import TeamMark from "@/components/TeamMark";
import { data } from "@/lib/data";
import type { TeamBudget } from "@/lib/types";

const CONFERENCE_ORDER = ["SEC", "Big Ten", "Big 12", "ACC", "Independent"];

function groupsOf(teams: TeamBudget[]): [string, TeamBudget[]][] {
  const map = new Map<string, TeamBudget[]>();
  for (const team of [...teams].sort((a, b) => a.name.localeCompare(b.name))) {
    const list = map.get(team.conference) ?? [];
    list.push(team);
    map.set(team.conference, list);
  }
  return [...map.keys()]
    .sort((a, b) => {
      const ia = CONFERENCE_ORDER.indexOf(a);
      const ib = CONFERENCE_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map((conference) => [conference, map.get(conference)!]);
}

function matches(team: TeamBudget, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return team.name.toLowerCase().includes(q) || team.abbr.toLowerCase().includes(q);
}

function reveal(menu: HTMLElement, slug: string) {
  const option = menu.querySelector<HTMLElement>(`[data-slug="${CSS.escape(slug)}"]`);
  if (!option) return;
  const menuBox = menu.getBoundingClientRect();
  const optionBox = option.getBoundingClientRect();
  if (optionBox.top < menuBox.top) menu.scrollTop -= menuBox.top - optionBox.top;
  else if (optionBox.bottom > menuBox.bottom) menu.scrollTop += optionBox.bottom - menuBox.bottom;
}

export default function ProgramSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(value);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const labelId = useId();
  const valueId = useId();
  const listId = useId();
  const selected = data.teams.find((t) => t.slug === value) ?? data.teams[0];
  const groups = useMemo(() => groupsOf(data.teams.filter((team) => matches(team, query))), [query]);
  const flat = useMemo(() => groups.flatMap(([, teams]) => teams), [groups]);

  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open || query.trim() !== "") return;
    const menu = listRef.current;
    if (menu) reveal(menu, value);
  }, [open, query, value]);

  useEffect(() => {
    if (!open || query.trim() === "") return;
    const first = flat[0];
    if (first) setActive(first.slug);
  }, [open, query, flat]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function closeAndFocusTrigger() {
    close();
    triggerRef.current?.focus({ preventScroll: true });
  }

  function openMenu(nextQuery = "") {
    setQuery(nextQuery);
    setActive(value);
    setOpen(true);
  }

  function choose(slug: string) {
    onChange(slug);
    closeAndFocusTrigger();
  }

  function move(delta: number) {
    const index = flat.findIndex((team) => team.slug === active);
    const start = index === -1 ? (delta > 0 ? -1 : 0) : index;
    const next = flat[Math.min(flat.length - 1, Math.max(0, start + delta))];
    if (!next) return;
    setActive(next.slug);
    const menu = listRef.current;
    if (menu) reveal(menu, next.slug);
  }

  function onQueryKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const pick = flat.find((team) => team.slug === active) ?? flat[0];
      if (pick) choose(pick.slug);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeAndFocusTrigger();
    } else if (event.key === "Tab") {
      // Let the browser move focus before removing the combobox from the DOM.
      requestAnimationFrame(() => {
        if (!rootRef.current?.contains(document.activeElement)) close();
      });
    }
  }

  return (
    <div ref={rootRef} className={open ? "relative z-40" : "relative"}>
      <span id={labelId} className="text-xs font-semibold text-fog">
        {label}
      </span>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${labelId} ${valueId}`}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!open) openMenu();
          } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
            event.preventDefault();
            openMenu(event.key);
          }
        }}
        className="mt-1 flex w-full items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2.5 text-left text-sm text-paper"
      >
        <TeamMark
          slug={selected.slug}
          name={selected.name}
          abbr={selected.abbr}
          color={selected.color}
          size="sm"
        />
        <span id={valueId} className="min-w-0 flex-1 truncate font-semibold">{selected.name}</span>
        <svg viewBox="0 0 12 12" aria-hidden="true" className="h-3 w-3 shrink-0 text-fog">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-edge bg-ink">
          <input
            ref={inputRef}
            value={query}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={flat.some((team) => team.slug === active) ? `${listId}-${active}` : undefined}
            aria-label={`Find a school for ${label}`}
            placeholder="Type a school"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setQuery(event.target.value);
              if (listRef.current) listRef.current.scrollTop = 0;
            }}
            onKeyDown={onQueryKey}
            className="w-full border-b border-edge bg-transparent px-3 py-2.5 text-sm text-paper outline-none placeholder:text-fog focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-paper"
          />
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-labelledby={labelId}
            className="max-h-72 overflow-auto py-1"
          >
            {flat.length === 0 ? (
              <li className="px-3 py-2 text-sm text-fog">No school matches</li>
            ) : (
              groups.map(([conference, teams]) => (
                <li key={conference} role="presentation">
                  <p className="px-3 pb-1 pt-2 text-xs font-semibold text-fog">{conference}</p>
                  <ul role="presentation">
                    {teams.map((team) => {
                      const isActive = team.slug === active;
                      const isSelected = team.slug === value;
                      return (
                        <li key={team.slug} role="presentation">
                          <button
                            type="button"
                            tabIndex={-1}
                            id={`${listId}-${team.slug}`}
                            role="option"
                            data-slug={team.slug}
                            aria-selected={isSelected}
                            onClick={() => choose(team.slug)}
                            className={`no-press flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-panel ${
                              isActive ? "bg-panel" : ""
                            } ${isSelected ? "font-semibold" : ""}`}
                          >
                            <TeamMark
                              slug={team.slug}
                              name={team.name}
                              abbr={team.abbr}
                              color={team.color}
                              size="sm"
                            />
                            <span className="truncate">{team.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
