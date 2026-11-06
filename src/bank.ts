// Mistake bank: every position you erred in, scheduled for spaced repetition (Leitner boxes).
// Stored in this browser's localStorage, so it builds up as you analyze days.
import { useCallback, useEffect, useState } from "react";
import { keyMoments, type Classification, type GameAnalysis, type MoveInfo, type Phase } from "@/analysis";
import { opponent } from "@/lib/chess-ui";
import type { Color, Platform } from "@/games";

export interface BankItem {
  key: string; // position (board, side, castling, en passant)
  fen: string;
  color: Color;
  moveLabel: string;
  phase: Phase;
  bestUci: string | null;
  bestSan: string | null;
  bestPv: string[]; // engine line from this position
  playedUci: string;
  playedSan: string;
  playedPv: string[]; // engine line after the move you played
  prevUci?: string;
  prevSan?: string;
  wpBefore: number;
  wpAfter: number;
  classification: Classification;
  isMiss: boolean;
  tags: string[];
  opponent: string;
  platform: Platform;
  gameId: string;
  gameUrl: string;
  ply: number;
  playedAt: number;
  // Spaced repetition
  gameIds: string[]; // games where you erred in this exact position
  box: number; // 0 = new, 1..5 = learned more and more
  due: number; // ms timestamp
  reviews: number;
  lapses: number;
  addedAt: number;
  lastReviewed?: number;
}

/** Days until the next review after a clean solve, by box. Box 0 = new (due now). */
export const INTERVAL_DAYS = [0, 1, 3, 7, 21, 60];
const DAY = 86_400_000;
const KEY = "chess-coach:bank:v1";

export const positionKey = (fen: string) => fen.split(" ").slice(0, 4).join(" ");

export function toBankItem(a: GameAnalysis, m: MoveInfo): BankItem {
  const prev = a.moves[m.ply - 1];
  return {
    key: positionKey(m.fenBefore),
    fen: m.fenBefore,
    color: m.color,
    moveLabel: m.moveLabel,
    phase: m.phase,
    bestUci: m.bestUci,
    bestSan: m.bestSan,
    bestPv: a.evals[m.ply].pv,
    playedUci: m.uci,
    playedSan: m.san,
    playedPv: a.evals[m.ply + 1].pv,
    prevUci: prev?.uci,
    prevSan: prev?.san,
    wpBefore: m.wpBefore,
    wpAfter: m.wpAfter,
    classification: m.classification,
    isMiss: m.isMiss,
    tags: m.tags,
    opponent: opponent(a.game).name,
    platform: a.game.platform,
    gameId: a.game.id,
    gameUrl: a.game.url,
    ply: m.ply,
    playedAt: a.game.endTime,
    gameIds: [a.game.id],
    box: 0,
    due: 0,
    reviews: 0,
    lapses: 0,
    addedAt: Date.now(),
  };
}

function load(): Record<string, BankItem> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

function save(items: Record<string, BankItem>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage full or blocked: the bank just won't persist */
  }
}

export function useBank() {
  const [items, setItems] = useState<Record<string, BankItem>>(load);
  useEffect(() => save(items), [items]);

  /** Adds a game's mistakes. Erring again in a known position sends it back to the start. */
  const addGame = useCallback((a: GameAnalysis) => {
    setItems((prev) => {
      const next = { ...prev };
      for (const m of keyMoments(a)) {
        const fresh = toBankItem(a, m);
        const old = next[fresh.key];
        if (!old) {
          next[fresh.key] = { ...fresh, due: Date.now() };
        } else if (!old.gameIds.includes(a.game.id)) {
          // Same position, same kind of mistake, new game: it's a habit. Reset its schedule.
          next[fresh.key] = { ...fresh, gameIds: [...old.gameIds, a.game.id], box: 0, due: Date.now(),
            reviews: old.reviews, lapses: old.lapses + 1, addedAt: old.addedAt, lastReviewed: old.lastReviewed };
        }
      }
      return next;
    });
  }, []);

  /** Records a drill attempt: a first-try solve moves the card up a box; anything else resets it to tomorrow. */
  const record = useCallback((key: string, firstTry: boolean) => {
    setItems((prev) => {
      const it = prev[key];
      if (!it) return prev;
      const now = Date.now();
      const box = firstTry ? Math.min(it.box + 1, INTERVAL_DAYS.length - 1) : 1;
      return {
        ...prev,
        [key]: {
          ...it,
          box,
          due: now + INTERVAL_DAYS[box] * DAY,
          reviews: it.reviews + 1,
          lapses: it.lapses + (firstTry ? 0 : 1),
          lastReviewed: now,
        },
      };
    });
  }, []);

  const list = Object.values(items);
  const now = Date.now();
  const due = list.filter((i) => i.due <= now).sort((a, b) => a.due - b.due || a.playedAt - b.playedAt);
  return { items, list, due, addGame, record };
}

/** Tag counts over bank items you erred in during the last `days` days (by game date). */
export function recentTagCounts(list: BankItem[], days = 14) {
  const since = Date.now() - days * DAY;
  const counts = new Map<string, number>();
  for (const it of list) {
    if (it.playedAt < since) continue;
    for (const t of it.tags) {
      const k = t.replace(/ in \d+$/, "");
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export function nextReviewText(it: BankItem) {
  const days = Math.round((it.due - Date.now()) / DAY);
  if (days <= 0) return "due now";
  return days === 1 ? "tomorrow" : `in ${days} days`;
}
