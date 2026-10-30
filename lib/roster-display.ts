import type { RosterPlayer } from "./season-snapshot";

/** Display accepts unfamiliar source statuses without rewriting or discarding them. */
export type DisplayPlayer = Omit<RosterPlayer, "side"> & { side: string };
export type RosterEntry = { key: string; player: DisplayPlayer };
export type RosterGroup = { key: string; label: string; total: number; players: RosterEntry[] };
export type RosterUnit = { key: string; label: string; total: number; groups: RosterGroup[] };

const UNITS = [
  { key: "offense", label: "Offense", groups: [
    { label: "Quarterbacks", positions: ["QB"] },
    { label: "Running backs", positions: ["RB", "FB"] },
    { label: "Wide receivers", positions: ["WR"] },
    { label: "Tight ends", positions: ["TE"] },
    { label: "Offensive line", positions: ["OL", "OT", "OG", "C", "IOL"] },
  ] },
  { key: "defense", label: "Defense", groups: [
    { label: "Defensive line", positions: ["DL", "DE", "DT", "NT", "EDGE"] },
    { label: "Linebackers", positions: ["LB", "ILB", "OLB"] },
    { label: "Defensive backs", positions: ["DB", "CB", "S", "NB"] },
  ] },
  { key: "special", label: "Special teams", groups: [
    { label: "Kickers", positions: ["K", "PK"] }, { label: "Punters", positions: ["P"] },
    { label: "Long snappers", positions: ["LS"] }, { label: "Returners", positions: ["PR", "KR"] },
  ] },
];
const POSITIONS = UNITS.flatMap((unit) => unit.groups.flatMap((group) => group.positions));
const statusLabels: Record<string, string> = { injured: "Injured", suspended: "Suspended", practice: "Practice" };
const normalSides = new Set(UNITS.map((unit) => unit.key));

function searchText(value: string): string {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/** Current labels and source fields stay intact; keys include original row identity. */
export function groupRoster(roster: readonly DisplayPlayer[], query = ""): RosterUnit[] {
  const units = new Map<string, RosterUnit>();
  const queryText = searchText(query);
  roster.forEach((player, index) => {
    const active = normalSides.has(player.side);
    const knownUnit = UNITS.find((unit) => unit.groups.some((group) => group.positions.includes(player.pos)));
    const knownGroup = knownUnit?.groups.find((group) => group.positions.includes(player.pos));
    const key = active ? knownUnit?.key ?? "other" : `status:${player.side}`;
    const label = active ? knownUnit?.label ?? "Other" : statusLabels[player.side] ?? `Status: ${player.side || "Unlisted"}`;
    const groupLabel = knownGroup?.label ?? "Unlisted positions";
    const unit = units.get(key) ?? { key, label, total: 0, groups: [] };
    const groupKey = `${key}:${groupLabel}`;
    let group = unit.groups.find((entry) => entry.key === groupKey);
    if (!group) { group = { key: groupKey, label: groupLabel, total: 0, players: [] }; unit.groups.push(group); }
    unit.total++; group.total++;
    if (!queryText || searchText(player.name).includes(queryText)) group.players.push({ key: `${player.side}-${player.jersey}-${player.name}-${index}`, player });
    units.set(key, unit);
  });
  const positionRank = (pos: string) => { const index = POSITIONS.indexOf(pos); return index < 0 ? POSITIONS.length : index; };
  const order = [...UNITS.map((unit) => unit.key), "other", "status:injured", "status:suspended", "status:practice"];
  return [...units.values()].sort((a, b) => {
    const rank = (key: string) => { const index = order.indexOf(key); return index < 0 ? order.length : index; };
    return rank(a.key) - rank(b.key) || a.label.localeCompare(b.label, "en");
  }).map((unit) => ({ ...unit, groups: unit.groups.sort((a, b) => {
    const names = UNITS.find((entry) => entry.key === unit.key)?.groups.map((group) => group.label) ?? UNITS.flatMap((entry) => entry.groups.map((group) => group.label));
    const rank = (label: string) => { const index = names.indexOf(label); return index < 0 ? names.length : index; };
    return rank(a.label) - rank(b.label);
  }).map((group) => ({ ...group, players: group.players.sort((a, b) => positionRank(a.player.pos) - positionRank(b.player.pos) || a.player.name.localeCompare(b.player.name, "en") || a.player.jersey.localeCompare(b.player.jersey, "en", { numeric: true })) }))
    .filter((group) => !queryText || group.players.length > 0) })).filter((unit) => unit.groups.length > 0);
}
