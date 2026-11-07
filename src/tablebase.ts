// Exact endgame verdicts (7 pieces or fewer) from the public Lichess tablebase API.
import type { GameAnalysis, MoveInfo } from "@/analysis";

export type Verdict = "win" | "draw" | "loss";
const CACHE = "chess-coach:tb:v1";
const MAX_PIECES = 7;

const pieceCount = (fen: string) => fen.split(" ")[0].replace(/[^a-zA-Z]/g, "").length;

function readCache(): Record<string, Verdict> {
  try {
    return JSON.parse(localStorage.getItem(CACHE) ?? "{}");
  } catch {
    return {};
  }
}

function writeCache(c: Record<string, Verdict>) {
  try {
    localStorage.setItem(CACHE, JSON.stringify(c));
  } catch { /* ignore */ }
}

/** Verdict for the side to move. Cursed wins / blessed losses are draws in practice (50-move rule). */
async function lookup(fen: string, cache: Record<string, Verdict>): Promise<Verdict | null> {
  const key = fen.split(" ").slice(0, 4).join(" ");
  if (cache[key]) return cache[key];
  const res = await fetch(`https://tablebase.lichess.org/standard?fen=${encodeURIComponent(fen)}`);
  if (!res.ok) return null; // 429 or outage: skip quietly
  const cat: string = (await res.json()).category;
  const v: Verdict | null =
    cat === "win" || cat === "maybe-win" ? "win"
    : cat === "loss" || cat === "maybe-loss" ? "loss"
    : cat === "draw" || cat === "cursed-win" || cat === "blessed-loss" ? "draw"
    : null;
  if (v) cache[key] = v;
  return v;
}

const flip = (v: Verdict): Verdict => (v === "win" ? "loss" : v === "loss" ? "win" : "draw");
const WORD: Record<Verdict, string> = { win: "winning", draw: "drawn", loss: "lost" };

/**
 * For your mistakes with 7 or fewer pieces, asks the tablebase what the position really was before and
 * after your move, and tags the ones that changed the result (e.g. "Endgame: winning → drawn").
 * One request at a time, as Lichess asks.
 */
export async function addEndgameVerdicts(a: GameAnalysis): Promise<void> {
  const targets = a.moves.filter(
    (m) => m.color === a.game.userColor && m.drop >= 5 && pieceCount(m.fenBefore) <= MAX_PIECES,
  );
  if (!targets.length) return;
  const cache = readCache();
  try {
    for (const m of targets) {
      const before = await lookup(m.fenBefore, cache);
      const afterOpp = await lookup(m.fenAfter, cache);
      if (!before || !afterOpp) continue;
      const after = flip(afterOpp);
      (m as MoveInfo).tablebase = { before, after };
      if (before !== after) m.tags.push(`Endgame: ${WORD[before]} → ${WORD[after]}`);
    }
  } catch {
    /* network error: verdicts are a bonus, never block the analysis */
  }
  writeCache(cache);
}

export const verdictWord = (v: Verdict) => WORD[v];
