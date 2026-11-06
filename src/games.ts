// Fetches one day's games for a user from Lichess or Chess.com (both public, no API key).
import { Chess } from "chess.js";

export type Platform = "lichess" | "chesscom";
export type Color = "w" | "b";

export type EndReason =
  | "checkmate" | "resignation" | "time" | "abandoned"
  | "agreement" | "repetition" | "stalemate" | "insufficient" | "fiftyMove" | "other";

export const END_REASON_LABEL: Record<EndReason, string> = {
  checkmate: "Checkmate",
  resignation: "Resignation",
  time: "On time",
  abandoned: "Abandoned",
  agreement: "Agreement",
  repetition: "Repetition",
  stalemate: "Stalemate",
  insufficient: "Insufficient material",
  fiftyMove: "50-move rule",
  other: "Other",
};

const LICHESS_END: Record<string, EndReason> = {
  mate: "checkmate", resign: "resignation", outoftime: "time", timeout: "abandoned",
  draw: "agreement", stalemate: "stalemate",
};

// Chess.com reports the losing side's result for decisive games, and either side's for draws.
const CHESSCOM_END: Record<string, EndReason> = {
  checkmated: "checkmate", resigned: "resignation", timeout: "time", abandoned: "abandoned",
  agreed: "agreement", repetition: "repetition", stalemate: "stalemate", insufficient: "insufficient",
  timevsinsufficient: "insufficient", "50move": "fiftyMove",
};

export interface GameRecord {
  id: string;
  platform: Platform;
  url: string;
  white: { name: string; rating?: number };
  black: { name: string; rating?: number };
  userColor: Color;
  result: "win" | "loss" | "draw";
  resultDetail: string;
  endReason: EndReason;
  timeClass: string;
  endTime: number; // ms since epoch
  startFen?: string;
  sanMoves: string[];
  opening?: string;
}

export function dayRange(dateStr: string): { start: number; end: number } {
  // dateStr is YYYY-MM-DD in the viewer's local time zone.
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(y, m - 1, d).getTime();
  const end = new Date(y, m - 1, d + 1).getTime();
  return { start, end };
}

export async function fetchDayGames(platform: Platform, username: string, dateStr: string): Promise<GameRecord[]> {
  const { start, end } = dayRange(dateStr);
  const games = platform === "lichess"
    ? await fetchLichess(username, start, end)
    : await fetchChessCom(username, start, end);
  return games.sort((a, b) => a.endTime - b.endTime);
}

// ---------- Lichess ----------

async function fetchLichess(username: string, start: number, end: number): Promise<GameRecord[]> {
  const params = new URLSearchParams({
    since: String(start),
    until: String(end),
    moves: "true",
    opening: "true",
    clocks: "false",
    evals: "false",
  });
  const res = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params}`, {
    headers: { Accept: "application/x-ndjson" },
  });
  if (res.status === 404) throw new Error(`Lichess user "${username}" not found.`);
  if (res.status === 429) throw new Error("Lichess rate limit hit. Wait a minute and try again.");
  if (!res.ok) throw new Error(`Lichess returned HTTP ${res.status}.`);
  const text = await res.text();
  const out: GameRecord[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const g = JSON.parse(line);
    if (g.variant !== "standard" && g.variant !== "fromPosition") continue;
    if (!g.moves) continue;
    const wName: string = g.players.white.user?.name ?? (g.players.white.aiLevel ? `Stockfish level ${g.players.white.aiLevel}` : "Anonymous");
    const bName: string = g.players.black.user?.name ?? (g.players.black.aiLevel ? `Stockfish level ${g.players.black.aiLevel}` : "Anonymous");
    const userColor: Color = wName.toLowerCase() === username.toLowerCase() ? "w" : "b";
    const winner: string | undefined = g.winner;
    const result = !winner ? "draw" : (winner === "white") === (userColor === "w") ? "win" : "loss";
    out.push({
      id: g.id,
      platform: "lichess",
      url: `https://lichess.org/${g.id}${userColor === "b" ? "/black" : ""}`,
      white: { name: wName, rating: g.players.white.rating },
      black: { name: bName, rating: g.players.black.rating },
      userColor,
      result,
      resultDetail: g.status,
      endReason: LICHESS_END[g.status] ?? "other",
      timeClass: g.speed,
      endTime: g.lastMoveAt ?? g.createdAt,
      startFen: g.initialFen,
      sanMoves: String(g.moves).split(" ").filter(Boolean),
      opening: g.opening?.name,
    });
  }
  return out;
}

// ---------- Chess.com ----------

const DRAW_RESULTS = new Set(["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"]);

async function fetchChessCom(username: string, start: number, end: number): Promise<GameRecord[]> {
  // Chess.com only serves whole months, so fetch every month the local day overlaps (in UTC).
  const months = new Set<string>();
  for (const t of [start, end - 1]) {
    const d = new Date(t);
    months.add(`${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const out: GameRecord[] = [];
  for (const month of months) {
    const data = await fetchChessComMonth(username, month);
    for (const g of data.games ?? []) {
      const endTime = g.end_time * 1000;
      if (endTime < start || endTime >= end) continue;
      if (g.rules !== "chess" || !g.pgn) continue;
      const parsed = parsePgn(g.pgn);
      if (!parsed) continue;
      const userColor: Color = g.white.username.toLowerCase() === username.toLowerCase() ? "w" : "b";
      const me = userColor === "w" ? g.white : g.black;
      const opp = userColor === "w" ? g.black : g.white;
      const result = me.result === "win" ? "win" : DRAW_RESULTS.has(me.result) ? "draw" : "loss";
      out.push({
        id: String(g.url).split("/").pop() ?? g.uuid,
        platform: "chesscom",
        url: g.url,
        white: { name: g.white.username, rating: g.white.rating },
        black: { name: g.black.username, rating: g.black.rating },
        userColor,
        result,
        resultDetail: result === "win" ? opp.result : me.result,
        endReason: CHESSCOM_END[result === "win" ? opp.result : me.result] ?? "other",
        timeClass: g.time_class,
        endTime,
        startFen: parsed.startFen,
        sanMoves: parsed.san,
        opening: parsed.opening,
      });
    }
  }
  return out;
}

// Month archives are cached briefly so the recent-days list and the analysis share one download.
const monthCache = new Map<string, { at: number; data: Promise<any> }>();

async function fetchChessComMonth(username: string, month: string): Promise<any> {
  const key = `${username.toLowerCase()}/${month}`;
  const hit = monthCache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.data;
  const data = (async () => {
    const res = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/games/${month}`);
    if (res.status === 404) return { games: [] }; // no archive for that month yet
    if (res.status === 429) throw new Error("Chess.com rate limit hit. Wait a minute and try again.");
    if (!res.ok) throw new Error(`Chess.com returned HTTP ${res.status}.`);
    return res.json();
  })();
  monthCache.set(key, { at: Date.now(), data });
  data.catch(() => monthCache.delete(key));
  return data;
}

export function localDateKey(t: number) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Days (local time) with standard Chess.com games over this month and last, newest first. */
export async function fetchRecentChessComDays(username: string): Promise<{ date: string; count: number }[]> {
  const now = new Date();
  const months = [0, 1].map((back) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const counts = new Map<string, number>();
  for (const month of months) {
    const data = await fetchChessComMonth(username, month);
    for (const g of data.games ?? []) {
      if (g.rules !== "chess") continue;
      const key = localDateKey(g.end_time * 1000);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => b.date.localeCompare(a.date));
}

function parsePgn(pgn: string): { san: string[]; startFen?: string; opening?: string } | null {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const headers = chess.getHeaders();
    const ecoUrl = headers["ECOUrl"];
    const opening = ecoUrl
      ? decodeURIComponent(ecoUrl.split("/").pop() ?? "")
          .replace(/-/g, " ")
          .replace(/\s*(\.{3})?\s*\d+\..*$/, "") // drop trailing move sequence like "...3.e3 d5"
          .trim()
      : undefined;
    return { san: chess.history(), startFen: headers["SetUp"] === "1" ? headers["FEN"] : undefined, opening };
  } catch {
    return null;
  }
}
