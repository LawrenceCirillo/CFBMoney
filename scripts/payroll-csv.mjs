import { readFileSync } from "node:fs";

export function parseCsv(contents) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < contents.length; i++) {
    const char = contents[i];
    if (quoted) {
      if (char === '"' && contents[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (quoted) throw new Error("unterminated CSV quote");
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const [headers, ...body] = rows.filter((entry) => entry.some((cell) => cell !== ""));
  if (!headers) throw new Error("CSV has no header");
  return body.map((entry, index) => {
    if (entry.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${entry.length} columns; expected ${headers.length}`);
    return Object.fromEntries(headers.map((header, column) => [header, entry[column]]));
  });
}

export function readCsv(path) {
  return parseCsv(readFileSync(path, "utf8"));
}
