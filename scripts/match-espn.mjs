// One-shot: match data/teams.json to ESPN site-v2 IDs and write espn_id.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const teams = JSON.parse(readFileSync(join(root, "data/teams.json"), "utf8"));

const DISPLAY = {
  Alabama: "Alabama Crimson Tide",
  Arizona: "Arizona Wildcats",
  "Arizona State": "Arizona State Sun Devils",
  Arkansas: "Arkansas Razorbacks",
  Auburn: "Auburn Tigers",
  Baylor: "Baylor Bears",
  "Boston College": "Boston College Eagles",
  BYU: "BYU Cougars",
  California: "California Golden Bears",
  Cincinnati: "Cincinnati Bearcats",
  Clemson: "Clemson Tigers",
  Colorado: "Colorado Buffaloes",
  Duke: "Duke Blue Devils",
  Florida: "Florida Gators",
  "Florida State": "Florida State Seminoles",
  Georgia: "Georgia Bulldogs",
  "Georgia Tech": "Georgia Tech Yellow Jackets",
  Houston: "Houston Cougars",
  Illinois: "Illinois Fighting Illini",
  Indiana: "Indiana Hoosiers",
  Iowa: "Iowa Hawkeyes",
  "Iowa State": "Iowa State Cyclones",
  Kansas: "Kansas Jayhawks",
  "Kansas State": "Kansas State Wildcats",
  Kentucky: "Kentucky Wildcats",
  LSU: "LSU Tigers",
  Louisville: "Louisville Cardinals",
  Maryland: "Maryland Terrapins",
  Miami: "Miami Hurricanes",
  Michigan: "Michigan Wolverines",
  "Michigan State": "Michigan State Spartans",
  Minnesota: "Minnesota Golden Gophers",
  Missouri: "Missouri Tigers",
  "Mississippi State": "Mississippi State Bulldogs",
  Nebraska: "Nebraska Cornhuskers",
  "North Carolina": "North Carolina Tar Heels",
  "NC State": "NC State Wolfpack",
  Northwestern: "Northwestern Wildcats",
  "Notre Dame": "Notre Dame Fighting Irish",
  "Ohio State": "Ohio State Buckeyes",
  Oklahoma: "Oklahoma Sooners",
  "Oklahoma State": "Oklahoma State Cowboys",
  "Ole Miss": "Ole Miss Rebels",
  Oregon: "Oregon Ducks",
  "Penn State": "Penn State Nittany Lions",
  Pitt: "Pittsburgh Panthers",
  SMU: "SMU Mustangs",
  Purdue: "Purdue Boilermakers",
  Rutgers: "Rutgers Scarlet Knights",
  "South Carolina": "South Carolina Gamecocks",
  Stanford: "Stanford Cardinal",
  Syracuse: "Syracuse Orange",
  TCU: "TCU Horned Frogs",
  Tennessee: "Tennessee Volunteers",
  Texas: "Texas Longhorns",
  "Texas A&M": "Texas A&M Aggies",
  "Texas Tech": "Texas Tech Red Raiders",
  UCF: "UCF Knights",
  UCLA: "UCLA Bruins",
  USC: "USC Trojans",
  Utah: "Utah Utes",
  Vanderbilt: "Vanderbilt Commodores",
  Virginia: "Virginia Cavaliers",
  "Virginia Tech": "Virginia Tech Hokies",
  "Wake Forest": "Wake Forest Demon Deacons",
  Washington: "Washington Huskies",
  "West Virginia": "West Virginia Mountaineers",
  Wisconsin: "Wisconsin Badgers",
};

const res = await fetch(
  "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=1000"
);
if (!res.ok) throw new Error(`ESPN catalog ${res.status}`);
const json = await res.json();
const byName = new Map();
function walk(obj) {
  if (!obj || typeof obj !== "object") return;
  const team = obj.team;
  if (team?.id && team.displayName) {
    const logos = team.logos ?? [];
    const dark = logos.find((l) => (l.rel ?? []).includes("dark"));
    const prev = byName.get(team.displayName);
    if (!prev || (dark && !prev.dark)) {
      byName.set(team.displayName, {
        id: String(team.id),
        displayName: team.displayName,
        dark: dark?.href ?? null,
      });
    }
  }
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") walk(v);
  }
}
walk(json);

const missing = [];
const next = teams.map((t) => {
  const display = DISPLAY[t.name];
  if (!display) missing.push(`no alias for ${t.name}`);
  const hit = byName.get(display);
  if (!hit) missing.push(`${t.name} → ${display}`);
  return { ...t, espn_id: hit?.id ?? null };
});

if (missing.length) {
  console.error("unmatched:\n" + missing.join("\n"));
  process.exit(1);
}

const ids = next.map((t) => t.espn_id);
if (new Set(ids).size !== ids.length) {
  throw new Error("duplicate espn_id after matching");
}

writeFileSync(join(root, "data/teams.json"), JSON.stringify(next) + "\n");
for (const t of next) {
  console.log(`${t.slug}\t${t.espn_id}\t${DISPLAY[t.name]}`);
}
console.log(`wrote espn_id for ${next.length} teams`);
