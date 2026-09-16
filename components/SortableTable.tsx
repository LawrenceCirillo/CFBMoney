"use client";

import Link from "next/link";
import { useMemo, useReducer } from "react";

export type Column<T> = {
  id: string;
  header: string;
  align?: "left" | "right";
  sortValue: (row: T) => string | number | null;
  cell: (row: T) => React.ReactNode;
  mono?: boolean;
};

type State = {
  sortId: string;
  direction: "asc" | "desc";
};

type Action = { type: "sort"; columnId: string };

function sortReducer(state: State, action: Action): State {
  if (action.columnId === state.sortId) {
    return { ...state, direction: state.direction === "asc" ? "desc" : "asc" };
  }
  return { sortId: action.columnId, direction: "desc" };
}

function compareValues(a: string | number | null, b: string | number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

type Props<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  defaultSortId: string;
  defaultDirection?: "asc" | "desc";
};

export function SortableTable<T>({
  rows,
  columns,
  rowKey,
  defaultSortId,
  defaultDirection = "desc",
}: Props<T>) {
  const [state, dispatch] = useReducer(sortReducer, {
    sortId: defaultSortId,
    direction: defaultDirection,
  });

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.id === state.sortId) ?? columns[0];
    const dir = state.direction === "asc" ? 1 : -1;
    return [...rows].sort(
      (a, b) => compareValues(col.sortValue(a), col.sortValue(b)) * dir,
    );
  }, [rows, columns, state]);

  return (
    <div className="overflow-x-auto border border-stone">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-stone bg-stone/40">
            {columns.map((col) => (
              <th
                key={col.id}
                className={`px-3 py-3 font-medium text-slate uppercase text-[10px] tracking-wider ${
                  col.align === "right" ? "text-right" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => dispatch({ type: "sort", columnId: col.id })}
                  className="inline-flex items-center gap-1 hover:text-obsidian"
                >
                  {col.header}
                  {state.sortId === col.id ? (
                    <span className="font-mono text-obsidian">
                      {state.direction === "asc" ? "↑" : "↓"}
                    </span>
                  ) : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={rowKey(row)}
              className={i % 2 === 0 ? "bg-white" : "bg-stone/20"}
            >
              {columns.map((col) => (
                <td
                  key={col.id}
                  className={`px-3 py-2.5 ${col.align === "right" ? "text-right" : ""} ${
                    col.mono ? "font-mono" : ""
                  }`}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TeamNameLink({ slug, name }: { slug: string; name: string }) {
  return (
    <Link href={`/team/${slug}`} className="font-medium text-obsidian hover:underline">
      {name}
    </Link>
  );
}
