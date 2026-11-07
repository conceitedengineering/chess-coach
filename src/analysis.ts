// Turns per-position engine evaluations into move classifications, misses and tags.
import { Chess } from "chess.js";
import type { EnginePool, EngineEval } from "./engine";
import type { Color, GameRecord } from "./games";

/** Evaluation from WHITE's point of view. */
export interface PosEval {
  cp?: number;
  mate?: number;
  best: string | null;
  pv: string[];
  terminal?: "checkmate" | "draw";
}

export type Classification = "best" | "good" | "inaccuracy" | "mistake" | "blunder";
export type Phase = "opening" | "middlegame" | "endgame";

export interface MoveInfo {
  ply: number; // 0-based index into the move list
  color: Color;
  moveLabel: string; // "12." or "12…"
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  wpBefore: number; // mover's win % before the move (with best play)
  wpAfter: number; // mover's win % after the move actually played
  drop: number;
  bestUci: string | null;
  bestSan: string | null;
  bestLine: string[]; // SAN
  classification: Classification;
  isMiss: boolean;
  tags: string[];
  phase: Phase;
  accuracy: number;
  /** Seconds the mover spent on this move and had left before it (when the game has clock data). */
  timeSpent?: number;
  clockBefore?: number;
  /** Exact result with perfect play, from the tablebase (endgames with ≤7 pieces). */
  tablebase?: { before: "win" | "draw" | "loss"; after: "win" | "draw" | "loss" };
}

export interface GameAnalysis {
  game: GameRecord;
  fens: string[]; // length = moves + 1
  evals: PosEval[]; // length = moves + 1
  moves: MoveInfo[];
  accuracy: number; // user's approximate accuracy
  counts: Record<"blunder" | "mistake" | "inaccuracy" | "miss", number>;
  opening?: import("@/openings").OpeningInfo | null;
}

// Thresholds on win-% drop, matching Lichess (0.1 / 0.2 / 0.3 on its -1..1 scale).
export const THRESHOLDS = { inaccuracy: 5, mistake: 10, blunder: 15 };
const MISS_OPP_ERROR = 10; // opponent must have dropped at least this much…
const MISS_GIVEBACK = 10; // …and you then gave back at least this much

/** Lichess's win-probability curve. */
export function winPct(e: PosEval): number {
  if (e.mate !== undefined) return e.mate > 0 ? 100 : 0;
  const cp = Math.max(-1000, Math.min(1000, e.cp ?? 0));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

function forColor(wp: number, c: Color) {
  return c === "w" ? wp : 100 - wp;
}

function mateFor(e: PosEval, c: Color): number | undefined {
  if (e.mate === undefined) return undefined;
  return c === "w" ? e.mate : -e.mate;
}

export function moveAccuracy(drop: number) {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * drop) - 3.1669 + 1));
}

export function formatEval(e: PosEval): string {
  if (e.terminal === "checkmate") return e.mate! > 0 ? "1-0" : "0-1";
  if (e.terminal === "draw") return "½-½";
  if (e.mate !== undefined) return `${e.mate > 0 ? "" : "-"}M${Math.abs(e.mate)}`;
  const p = (e.cp ?? 0) / 100;
  return `${p > 0 ? "+" : ""}${p.toFixed(1)}`;
}

interface Position {
  fens: string[];
  moves: { san: string; uci: string; color: Color }[];
}

export function buildPositions(game: GameRecord): Position {
  const chess = new Chess(game.startFen);
  const fens = [chess.fen()];
  const moves: Position["moves"] = [];
  for (const san of game.sanMoves) {
    const m = chess.move(san);
    moves.push({ san: m.san, uci: m.from + m.to + (m.promotion ?? ""), color: m.color });
    fens.push(chess.fen());
  }
  return { fens, moves };
}

export function toWhite(fen: string, e: EngineEval): PosEval {
  const flip = fen.split(" ")[1] === "b" ? -1 : 1;
  return {
    cp: e.cp !== undefined ? e.cp * flip : undefined,
    mate: e.mate !== undefined ? e.mate * flip : undefined,
    best: e.best,
    pv: e.pv,
  };
}

function terminalEval(fen: string): PosEval | null {
  const c = new Chess(fen);
  if (c.isCheckmate()) return { mate: c.turn() === "w" ? -1 : 1, best: null, pv: [], terminal: "checkmate" };
  if (c.isStalemate() || c.isInsufficientMaterial()) return { cp: 0, best: null, pv: [], terminal: "draw" };
  return null;
}

const CACHE_VERSION = "v1";
function cacheKey(game: GameRecord, depth: number) {
  return `chess-coach:${CACHE_VERSION}:${game.platform}:${game.id}:d${depth}`;
}
function readCache(key: string): PosEval[] | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as PosEval[]) : null;
  } catch {
    return null;
  }
}
function writeCache(key: string, evals: PosEval[]) {
  try {
    localStorage.setItem(key, JSON.stringify(evals));
  } catch {
    /* storage full or blocked: analysis still works, just not cached */
  }
}

export function positionCount(game: GameRecord) {
  return game.sanMoves.length + 1;
}

export async function analyseGame(
  game: GameRecord,
  pool: EnginePool,
  depth: number,
  onPosition: () => void,
): Promise<GameAnalysis> {
  const { fens, moves } = buildPositions(game);
  const key = cacheKey(game, depth);
  let evals = readCache(key);
  if (!evals || evals.length !== fens.length) {
    evals = await Promise.all(
      fens.map(async (fen) => {
        const t = terminalEval(fen);
        const e = t ?? toWhite(fen, await pool.evaluate(fen, depth));
        onPosition();
        return e;
      }),
    );
    writeCache(key, evals);
  } else {
    fens.forEach(() => onPosition());
  }
  return classify(game, fens, moves, evals);
}

function nonPawnMaterial(fen: string) {
  const board = fen.split(" ")[0];
  let total = 0;
  for (const ch of board) {
    const p = ch.toLowerCase();
    if (p === "n" || p === "b") total += 3;
    else if (p === "r") total += 5;
    else if (p === "q") total += 9;
  }
  return total;
}

function phaseOf(fen: string, ply: number): Phase {
  if (nonPawnMaterial(fen) <= 26) return "endgame";
  return ply < 20 ? "opening" : "middlegame";
}

function uciToSanLine(fen: string, pv: string[], max = 8): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const u of pv.slice(0, max)) {
    try {
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      out.push(m.san);
    } catch {
      break;
    }
  }
  return out;
}

function moveFacts(fen: string, uci: string | null) {
  const none = { capture: false, check: false, captured: undefined as string | undefined };
  if (!uci) return none;
  try {
    const m = new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return { capture: !!m.captured, check: m.san.includes("+") || m.san.includes("#"), captured: m.captured as string | undefined };
  } catch {
    return none;
  }
}

/**
 * Was this capture already on the board before the player moved? We hand the opponent the move
 * (a "null move") in the earlier position and see if the same capture of the same piece was legal.
 * If yes, the player ignored an existing threat; if no, their move created the problem.
 */
function threatExistedBefore(fenBefore: string, reply: string, capturedAfter: string | undefined) {
  const parts = fenBefore.split(" ");
  parts[1] = parts[1] === "w" ? "b" : "w";
  parts[3] = "-";
  try {
    const m = new Chess(parts.join(" ")).move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
    return !!m.captured && m.captured === capturedAfter;
  } catch {
    return false; // illegal there (or the null-move position is invalid, e.g. the player was in check)
  }
}

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function classify(
  game: GameRecord,
  fens: string[],
  moves: Position["moves"],
  evals: PosEval[],
): GameAnalysis {
  const out: MoveInfo[] = [];
  for (let i = 0; i < moves.length; i++) {
    const mv = moves[i];
    const before = evals[i];
    const after = evals[i + 1];
    const wpBefore = forColor(winPct(before), mv.color);
    const wpAfter = forColor(winPct(after), mv.color);
    const playedBest = before.best === mv.uci;
    const drop = playedBest ? 0 : Math.max(0, wpBefore - wpAfter);

    let classification: Classification =
      drop >= THRESHOLDS.blunder ? "blunder"
      : drop >= THRESHOLDS.mistake ? "mistake"
      : drop >= THRESHOLDS.inaccuracy ? "inaccuracy"
      : playedBest ? "best" : "good";

    const tags: string[] = [];
    const mateBefore = mateFor(before, mv.color);
    const mateAfter = mateFor(after, mv.color);
    const missedMate = !playedBest && mateBefore !== undefined && mateBefore > 0 && mateBefore <= 5
      && !(mateAfter !== undefined && mateAfter > 0) && after.terminal !== "checkmate";
    if (missedMate) tags.push(`Missed mate in ${mateBefore}`);
    if (mateAfter !== undefined && mateAfter < 0 && mateAfter >= -5 && !(mateBefore !== undefined && mateBefore < 0)) {
      tags.push(`Allowed mate in ${-mateAfter}`);
    }
    if (wpBefore >= 80 && wpAfter < 60) tags.push("Threw away a winning position");

    // Why it went wrong: what did the opponent's best reply punish?
    if (drop >= THRESHOLDS.mistake && after.best) {
      const reply = moveFacts(fens[i + 1], after.best);
      if (reply.capture) {
        tags.push(threatExistedBefore(fens[i], after.best, reply.captured) ? "Ignored a threat" : "Left material hanging");
      } else if (reply.check) {
        tags.push("Missed their check");
      }
    }

    const prev = out[i - 1];
    const isMiss = missedMate || (!!prev && prev.drop >= MISS_OPP_ERROR && drop >= MISS_GIVEBACK);
    if (isMiss) {
      const f = moveFacts(fens[i], before.best);
      if (f.capture && PIECE_VALUE[f.captured ?? "p"] >= 3) tags.push("Missed free material");
      else if (f.capture || f.check) tags.push("Missed tactic");
      if (classification === "best" || classification === "good") classification = "inaccuracy";
    }

    // Clock: how long this move took and how much time was left.
    let timeSpent: number | undefined;
    let clockBefore: number | undefined;
    const clocks = game.clocks;
    const tc = game.timeControl;
    if (clocks && tc) {
      clockBefore = i >= 2 ? clocks[i - 2] : tc.base;
      timeSpent = Math.max(0, clockBefore - clocks[i] + tc.inc);
      if (drop >= THRESHOLDS.mistake) {
        if (clockBefore < tc.base * 0.1) tags.push("Time trouble");
        else if (timeSpent < 3) tags.push("Moved too fast");
        else if (timeSpent >= Math.max(15, tc.base * 0.1)) tags.push("Long think, then mistake");
      }
    }

    const fullMove = Number(fens[i].split(" ")[5]);
    out.push({
      ply: i,
      color: mv.color,
      moveLabel: `${fullMove}${mv.color === "w" ? "." : "…"}`,
      san: mv.san,
      uci: mv.uci,
      fenBefore: fens[i],
      fenAfter: fens[i + 1],
      wpBefore,
      wpAfter,
      drop,
      bestUci: before.best,
      bestSan: before.best ? uciToSanLine(fens[i], [before.best], 1)[0] ?? null : null,
      bestLine: uciToSanLine(fens[i], before.pv),
      classification,
      isMiss,
      tags,
      phase: phaseOf(fens[i], i),
      accuracy: moveAccuracy(drop),
      timeSpent,
      clockBefore,
    });
  }

  const mine = out.filter((m) => m.color === game.userColor);
  const accuracy = mine.length ? mine.reduce((s, m) => s + m.accuracy, 0) / mine.length : 0;
  const counts = { blunder: 0, mistake: 0, inaccuracy: 0, miss: 0 };
  for (const m of mine) {
    if (m.isMiss) counts.miss++;
    if (m.classification === "blunder" || m.classification === "mistake" || m.classification === "inaccuracy") {
      counts[m.classification]++;
    }
  }
  return { game, fens, evals, moves: out, accuracy, counts };
}

/** The user's moves worth reviewing: mistakes, blunders and misses (inaccuracies only if also a miss). */
export function keyMoments(a: GameAnalysis): MoveInfo[] {
  return a.moves.filter(
    (m) => m.color === a.game.userColor && (m.isMiss || m.classification === "blunder" || m.classification === "mistake"),
  );
}
