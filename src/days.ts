// One saved summary per analyzed day, so trends can be charted over weeks.
import { useCallback, useState } from "react";
import { keyMoments, type GameAnalysis } from "@/analysis";

export interface OpeningStats {
  games: number;
  w: number;
  l: number;
  d: number;
  errors: number; // your mistakes + blunders + misses
}

export interface DaySummary {
  date: string; // YYYY-MM-DD (local)
  savedAt: number;
  depth: number;
  games: number;
  w: number;
  l: number;
  d: number;
  accuracy: number;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  misses: number;
  errors: number; // positions worth reviewing (mistakes, blunders, misses; a move counts once)
  tags: Record<string, number>;
  openings: Record<string, OpeningStats>; // by opening family
}

const KEY = "chess-coach:days:v1";

function load(): Record<string, DaySummary> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function summarizeDay(date: string, depth: number, analyses: GameAnalysis[]): DaySummary {
  const s: DaySummary = {
    date, savedAt: Date.now(), depth, games: analyses.length, w: 0, l: 0, d: 0, accuracy: 0,
    blunders: 0, mistakes: 0, inaccuracies: 0, misses: 0, errors: 0, tags: {}, openings: {},
  };
  for (const a of analyses) {
    const r = a.game.result;
    if (r === "win") s.w++;
    else if (r === "loss") s.l++;
    else s.d++;
    s.accuracy += a.accuracy / analyses.length;
    s.blunders += a.counts.blunder;
    s.mistakes += a.counts.mistake;
    s.inaccuracies += a.counts.inaccuracy;
    s.misses += a.counts.miss;
    const moments = keyMoments(a);
    s.errors += moments.length;
    for (const m of moments) {
      for (const t of m.tags) {
        const k = t.replace(/ in \d+$/, "");
        s.tags[k] = (s.tags[k] ?? 0) + 1;
      }
    }
    const fam = a.opening?.family ?? "Unknown opening";
    const o = (s.openings[fam] ??= { games: 0, w: 0, l: 0, d: 0, errors: 0 });
    o.games++;
    if (r === "win") o.w++;
    else if (r === "loss") o.l++;
    else o.d++;
    o.errors += moments.length;
  }
  return s;
}

export function useDays() {
  const [days, setDays] = useState<Record<string, DaySummary>>(load);
  const save = useCallback((d: DaySummary) => {
    setDays((prev) => {
      const next = { ...prev, [d.date]: d };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  }, []);
  const list = Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
  return { days, list, save };
}

/** Errors (mistakes + blunders + misses) per game: the headline trend. */
export const errorsPerGame = (d: DaySummary) => (d.games ? d.errors / d.games : 0);
