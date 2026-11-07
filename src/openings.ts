// Names each game's opening from Lichess's CC0 opening list and finds where it left known theory.
import type { Color } from "@/games";

export interface OpeningInfo {
  eco: string;
  name: string;
  family: string; // name before the first ":" e.g. "Sicilian Defense"
  bookPlies: number; // how many half-moves stayed in the list
  leftBy: Color | null; // who played the first move outside it (null if the game never left)
}

let table: Promise<Record<string, [string, string]>> | null = null;
// Served as a static file (~460 KB, ~63 KB gzipped) and fetched once, only when needed.
const loadTable = () =>
  (table ??= fetch(`${import.meta.env.BASE_URL}data/openings.json`).then((r) => {
    if (!r.ok) throw new Error(`openings.json: HTTP ${r.status}`);
    return r.json();
  }).catch((e) => {
    table = null; // try again next time
    throw e;
  }));

const epd = (fen: string) => fen.split(" ").slice(0, 4).join(" ");

/** fens[0] is the start position; fens[i] is after i half-moves. */
export async function identifyOpening(fens: string[]): Promise<OpeningInfo | null> {
  const t = await loadTable();
  let best: { i: number; hit: [string, string] } | null = null;
  for (let i = 1; i < Math.min(fens.length, 50); i++) {
    const hit = t[epd(fens[i])];
    if (hit) best = { i, hit };
  }
  if (!best) return null;
  const [eco, name] = best.hit;
  const next = fens[best.i];
  return {
    eco,
    name,
    family: name.split(":")[0],
    bookPlies: best.i,
    leftBy: best.i < fens.length - 1 ? (next.split(" ")[1] as Color) : null,
  };
}
