import { fmtPollDate } from "@/lib/format";
import { seasonSnapshot, type RosterPlayer, type TeamSeason } from "@/lib/season-snapshot";

const UNITS: { label: string; groups: { label: string; positions: string[] }[] }[] = [
  {
    label: "Offense",
    groups: [
      { label: "Quarterbacks", positions: ["QB"] },
      { label: "Running backs", positions: ["RB", "FB"] },
      { label: "Wide receivers", positions: ["WR"] },
      { label: "Tight ends", positions: ["TE"] },
      { label: "Offensive line", positions: ["OL", "OT", "OG", "C", "IOL"] },
    ],
  },
  {
    label: "Defense",
    groups: [
      { label: "Defensive line", positions: ["DL", "DE", "DT", "NT", "EDGE"] },
      { label: "Linebackers", positions: ["LB", "ILB", "OLB"] },
      { label: "Defensive backs", positions: ["DB", "CB", "S", "NB"] },
    ],
  },
  {
    label: "Special teams",
    groups: [
      { label: "Kickers", positions: ["K", "PK"] },
      { label: "Punters", positions: ["P"] },
      { label: "Long snappers", positions: ["LS"] },
      { label: "Returners", positions: ["PR", "KR"] },
    ],
  },
];

const POS_ORDER = UNITS.flatMap((unit) => unit.groups.flatMap((group) => group.positions));

function posRank(pos: string): number {
  const index = POS_ORDER.indexOf(pos);
  return index === -1 ? POS_ORDER.length : index;
}

function byPosition(a: RosterPlayer, b: RosterPlayer): number {
  const pos = posRank(a.pos) - posRank(b.pos);
  if (pos !== 0) return pos;
  return a.name.localeCompare(b.name);
}

function perGame(total: number, games: number): string {
  if (games <= 0) return "—";
  return `${(total / games).toFixed(1)} per game`;
}

function counted(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function margin(takeaways: number, giveaways: number): string {
  const diff = takeaways - giveaways;
  if (diff === 0) return "0";
  return diff > 0 ? `+${diff}` : `−${Math.abs(diff)}`;
}

function count(n: number): string {
  return n.toLocaleString("en-US");
}

export function SeasonFigure({ season }: { season: TeamSeason }) {
  const lines = [
    { label: "Passing", value: count(season.pass_yards), sub: perGame(season.pass_yards, season.games) },
    { label: "Rushing", value: count(season.rush_yards), sub: perGame(season.rush_yards, season.games) },
    {
      label: "Turnovers",
      value: margin(season.takeaways, season.giveaways),
      sub: `${counted(season.takeaways, "takeaway", "takeaways")}, ${counted(season.giveaways, "giveaway", "giveaways")}`,
    },
  ];
  const games = `${season.games} ${season.games === 1 ? "game" : "games"}`;

  return (
    <div>
      <h2 className="text-xs font-semibold text-fog">2026 so far</h2>
      <p className="tnum mt-2 text-6xl font-black tracking-tight">{season.record.replaceAll("-", "–")}</p>
      <p className="mt-1 text-sm text-fog">
        {games} · ESPN, as of {fmtPollDate(seasonSnapshot.as_of)}
      </p>
      <p className="tnum mt-6 text-3xl font-black tracking-tight">
        {count(season.points_for)}
        <span className="ml-2 text-lg font-semibold text-fog">scored</span>
        <span className="mx-3 text-lg font-semibold text-fog">·</span>
        {count(season.points_against)}
        <span className="ml-2 text-lg font-semibold text-fog">allowed</span>
      </p>
      <div className="mt-6 grid grid-cols-3 gap-4">
        {lines.map((line) => (
          <div key={line.label}>
            <p className="text-xs font-semibold text-fog">{line.label}</p>
            <p className="tnum mt-1 text-2xl font-black">{line.value}</p>
            <p className="mt-1 text-xs text-fog">{line.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

type RosterRow =
  | { kind: "unit"; key: string; label: string; count: number }
  | { kind: "group"; key: string; label: string; count: number }
  | { kind: "player"; key: string; player: RosterPlayer };

const ROSTER_COLS = "grid grid-cols-[3rem_minmax(0,1fr)_3.5rem_3rem] items-center gap-x-3 px-4";

function playerKey(player: RosterPlayer): string {
  return `${player.side}-${player.jersey}-${player.name}`;
}

function rosterRows(roster: RosterPlayer[]): RosterRow[] {
  const placed = new Set<string>();
  const rows: RosterRow[] = [];

  for (const unit of UNITS) {
    const groups = unit.groups
      .map((group) => {
        const positions = new Set(group.positions);
        const players = roster.filter((player) => positions.has(player.pos)).sort(byPosition);
        for (const player of players) placed.add(playerKey(player));
        return { label: group.label, players };
      })
      .filter((group) => group.players.length > 0);
    if (groups.length === 0) continue;

    const count = groups.reduce((sum, group) => sum + group.players.length, 0);
    rows.push({ kind: "unit", key: unit.label, label: unit.label, count });
    for (const group of groups) {
      rows.push({
        kind: "group",
        key: `${unit.label}-${group.label}`,
        label: group.label,
        count: group.players.length,
      });
      for (const player of group.players) {
        rows.push({ kind: "player", key: playerKey(player), player });
      }
    }
  }

  const other = roster.filter((player) => !placed.has(playerKey(player))).sort(byPosition);
  if (other.length > 0) {
    rows.push({ kind: "unit", key: "Other", label: "Other", count: other.length });
    rows.push({ kind: "group", key: "Other-unlisted", label: "Unlisted positions", count: other.length });
    for (const player of other) rows.push({ kind: "player", key: playerKey(player), player });
  }

  return rows;
}

function RosterLine({ row }: { row: RosterRow }) {
  switch (row.kind) {
    case "unit":
      return (
        <div className={`${ROSTER_COLS} border-b border-line bg-panel py-2.5 last:border-b-0`}>
          <span />
          <span className="col-span-2 text-sm font-semibold">{row.label}</span>
          <span className="tnum text-right text-sm text-fog">{row.count}</span>
        </div>
      );
    case "group":
      return (
        <div className={`${ROSTER_COLS} border-b border-line/60 bg-panel/40 py-2 last:border-b-0`}>
          <span />
          <span className="col-span-2 text-xs font-semibold text-fog">{row.label}</span>
          <span className="tnum text-right text-xs text-fog">{row.count}</span>
        </div>
      );
    case "player":
      return (
        <div className={`${ROSTER_COLS} border-b border-line/60 py-2 text-sm last:border-b-0`}>
          <span className="tnum text-right text-fog">{row.player.jersey || "—"}</span>
          <span className="min-w-0 truncate font-semibold">{row.player.name}</span>
          <span className="text-fog">{row.player.pos || "—"}</span>
          <span className="text-right text-fog">{row.player.year || "—"}</span>
        </div>
      );
    default: {
      const exhaustive: never = row;
      return exhaustive;
    }
  }
}

export function TeamRoster({ season }: { season: TeamSeason }) {
  const rows = rosterRows(season.roster);

  return (
    <section className="mt-16">
      <h2 className="text-xs font-semibold text-fog">Roster</h2>
      <div className="mt-4 overflow-hidden rounded-xl border border-edge">
        <div className={`${ROSTER_COLS} border-b border-line bg-panel/60 py-2 text-xs font-semibold text-fog`}>
          <span className="text-right">#</span>
          <span>Player</span>
          <span>Pos</span>
          <span className="text-right">Year</span>
        </div>
        {rows.map((row) => (
          <RosterLine key={row.key} row={row} />
        ))}
      </div>
    </section>
  );
}
