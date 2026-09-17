"use client";

import { SortableTable, TeamNameLink, type Column } from "@/components/SortableTable";
import type { Team } from "@/lib/types";
import { formatBudgetMid, formatBudgetRange } from "@/lib/format";

type Props = { teams: Team[] };

export function SpendingTable({ teams }: Props) {
  const byBudget = [...teams].sort((a, b) => b.budgetMid - a.budgetMid);

  const columns: Column<Team>[] = [
    {
      id: "rank",
      header: "#",
      align: "right",
      sortValue: (t) => byBudget.findIndex((x) => x.slug === t.slug) + 1,
      cell: (t) => byBudget.findIndex((x) => x.slug === t.slug) + 1,
      mono: true,
    },
    {
      id: "name",
      header: "Team",
      sortValue: (t) => t.name,
      cell: (t) => <TeamNameLink slug={t.slug} name={t.name} />,
    },
    {
      id: "conf",
      header: "Conf",
      sortValue: (t) => t.conference,
      cell: (t) => <span className="text-slate">{t.conference}</span>,
    },
    {
      id: "range",
      header: "Budget range",
      align: "right",
      sortValue: (t) => t.budgetMin,
      cell: (t) => formatBudgetRange(t.budgetMin, t.budgetMax),
      mono: true,
    },
    {
      id: "mid",
      header: "Mid",
      align: "right",
      sortValue: (t) => t.budgetMid,
      cell: (t) => formatBudgetMid(t.budgetMid),
      mono: true,
    },
  ];

  return (
    <SortableTable
      rows={teams}
      columns={columns}
      rowKey={(t) => t.slug}
      defaultSortId="mid"
      defaultDirection="desc"
    />
  );
}
