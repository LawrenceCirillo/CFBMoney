"use client";

import { SortableTable, TeamNameLink, type Column } from "@/components/SortableTable";
import type { Team } from "@/lib/types";
import {
  formatBudgetMid,
  formatMillions,
  formatRecord,
  formatSigned,
} from "@/lib/format";

type Props = { teams: Team[] };

export function MoneyballTable({ teams }: Props) {
  const columns: Column<Team>[] = [
    {
      id: "name",
      header: "Team",
      sortValue: (t) => t.name,
      cell: (t) => <TeamNameLink slug={t.slug} name={t.name} />,
    },
    {
      id: "mid",
      header: "Budget mid",
      align: "right",
      sortValue: (t) => t.budgetMid,
      cell: (t) => formatBudgetMid(t.budgetMid),
      mono: true,
    },
    {
      id: "wins",
      header: "2025 W-L",
      align: "right",
      sortValue: (t) => t.record2025.wins,
      cell: (t) => formatRecord(t.record2025.wins, t.record2025.losses),
      mono: true,
    },
    {
      id: "exp",
      header: "Exp wins",
      align: "right",
      sortValue: (t) => t.moneyball.expectedWins2025,
      cell: (t) => t.moneyball.expectedWins2025.toFixed(2),
      mono: true,
    },
    {
      id: "wae",
      header: "WAE",
      align: "right",
      sortValue: (t) => t.moneyball.winsAboveExpected2025,
      cell: (t) => formatSigned(t.moneyball.winsAboveExpected2025),
      mono: true,
    },
    {
      id: "dpw",
      header: "$/win (mid)",
      align: "right",
      sortValue: (t) => t.moneyball.dollarsPerWin2025MidM,
      cell: (t) => formatMillions(t.moneyball.dollarsPerWin2025MidM),
      mono: true,
    },
  ];

  return (
    <SortableTable
      rows={teams}
      columns={columns}
      rowKey={(t) => t.slug}
      defaultSortId="wae"
      defaultDirection="desc"
    />
  );
}
