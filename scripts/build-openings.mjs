// Builds public/data/openings.json (position -> [eco, name]) from Lichess's CC0 opening list.
// Usage: download a.tsv…e.tsv from https://github.com/lichess-org/chess-openings, then
//   node scripts/build-openings.mjs <folder-with-tsvs>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Chess } from "chess.js";

const dir = process.argv[2];
if (!dir) throw new Error("Pass the folder containing a.tsv … e.tsv");
const out = {};
for (const f of ["a", "b", "c", "d", "e"]) {
  const lines = readFileSync(join(dir, `${f}.tsv`), "utf8").trim().split("\n").slice(1);
  for (const line of lines) {
    const [eco, name, pgn] = line.split("\t");
    const chess = new Chess();
    chess.loadPgn(pgn);
    const epd = chess.fen().split(" ").slice(0, 4).join(" ");
    out[epd] = [eco, name];
  }
}
writeFileSync("public/data/openings.json", JSON.stringify(out));
console.log(`${Object.keys(out).length} openings written to public/data/openings.json`);
