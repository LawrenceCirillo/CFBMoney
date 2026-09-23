// Rasterize the curated team marks once at build time. The small atlas lets the
// shared score ticker show every game with a single image request.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sources = JSON.parse(readFileSync(join(root, "data/team-marks.json"), "utf8"));
const teams = JSON.parse(readFileSync(join(root, "data/teams.json"), "utf8"));
const slugs = teams.map((team) => team.slug).sort();
const outputDir = join(root, "public/marks");
const columns = 8;
const cell = 48; // 2x the ticker's 24 CSS pixels.
const rows = Math.ceil(slugs.length / columns);

if (new Set(slugs).size !== slugs.length) throw new Error("Duplicate team slug");
const missing = slugs.filter((slug) => !sources[slug]);
const extra = Object.keys(sources).filter((slug) => !slugs.includes(slug));
if (missing.length || extra.length) {
  throw new Error(`Mark source mismatch: missing ${missing.join(", ") || "none"}; extra ${extra.join(", ") || "none"}`);
}

mkdirSync(outputDir, { recursive: true });
const layers = [];
let totalBytes = 0;

for (const [index, slug] of slugs.entries()) {
  const source = resolve(root, sources[slug]);
  if (!source.startsWith(root + sep) || !existsSync(source)) {
    throw new Error(`Invalid mark source for ${slug}: ${sources[slug]}`);
  }

  const mark = await sharp(source, { density: 144 })
    .resize(128, 128, { fit: "contain", background: "#00000000" })
    .webp({ quality: 88, effort: 6 })
    .toFile(join(outputDir, `${slug}.webp`));
  totalBytes += mark.size;

  const tickerMark = await sharp(source, { density: 144 })
    .resize(40, 40, { fit: "contain", background: "#00000000" })
    .png()
    .toBuffer();
  layers.push({
    input: tickerMark,
    left: (index % columns) * cell + 4,
    top: Math.floor(index / columns) * cell + 4,
  });
}

const atlas = await sharp({
  create: {
    width: columns * cell,
    height: rows * cell,
    channels: 4,
    background: "#00000000",
  },
})
  .composite(layers)
  .webp({ quality: 88, effort: 6 })
  .toFile(join(outputDir, "ticker.webp"));

console.log(`cfb-money: built ${slugs.length} marks (${Math.round(totalBytes / 1024)} KiB total) and one ${Math.round(atlas.size / 1024)} KiB ticker atlas`);
