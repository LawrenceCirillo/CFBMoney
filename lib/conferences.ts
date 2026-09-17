const CONFERENCE_COLORS: Record<string, string> = {
  SEC: "#0F172A",
  "Big Ten": "#334155",
  "Big 12": "#64748B",
  ACC: "#94A3B8",
  Independent: "#DBFF00",
};

export function conferenceColor(conference: string): string {
  if (conference === "Independent") return CONFERENCE_COLORS.Independent;
  return CONFERENCE_COLORS[conference] ?? "#64748B";
}

export const CONFERENCE_LEGEND = [
  { label: "SEC", color: CONFERENCE_COLORS.SEC },
  { label: "Big Ten", color: CONFERENCE_COLORS["Big Ten"] },
  { label: "Big 12", color: CONFERENCE_COLORS["Big 12"] },
  { label: "ACC", color: CONFERENCE_COLORS.ACC },
  { label: "Notre Dame", color: CONFERENCE_COLORS.Independent },
];
