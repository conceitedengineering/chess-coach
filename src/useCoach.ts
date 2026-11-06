import { useCallback, useEffect, useRef, useState } from "react";
import { EnginePool } from "@/engine";
import { fetchDayGames, type GameRecord, type Platform } from "@/games";
import { analyseGame, positionCount, type GameAnalysis } from "@/analysis";
import { platformName, plural } from "@/lib/chess-ui";

export interface Slot {
  game: GameRecord;
  analysis?: GameAnalysis;
}

export type Status =
  | { kind: "idle" }
  | { kind: "fetching"; message: string }
  | { kind: "analyzing"; message: string; progress: number }
  | { kind: "done" }
  | { kind: "error"; message: string };

export interface RunParams {
  platform: Platform;
  username: string;
  date: string;
  depth: number;
}

export function useCoach() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [depth, setDepth] = useState(13);
  const pool = useRef<EnginePool | null>(null);
  const runId = useRef(0);

  useEffect(() => () => pool.current?.terminate(), []);

  const run = useCallback(async ({ platform, username, date, depth: d }: RunParams) => {
    const id = ++runId.current;
    pool.current?.terminate();
    const p = new EnginePool();
    pool.current = p;
    setDepth(d);
    setSlots([]);
    setStatus({ kind: "fetching", message: `Fetching ${date} games from ${platformName(platform)}…` });

    let games: GameRecord[];
    try {
      games = await fetchDayGames(platform, username, date);
    } catch (err) {
      if (id === runId.current) setStatus({ kind: "error", message: (err as Error).message || "Could not load games." });
      return;
    }
    if (id !== runId.current) return;
    if (!games.length) {
      setStatus({ kind: "error", message: `No standard games found for ${username} on ${date}.` });
      return;
    }

    setSlots(games.map((game) => ({ game })));
    const total = games.reduce((s, g) => s + positionCount(g), 0);
    let done = 0;
    let finished = 0;
    let frame = 0;
    const report = () => {
      frame = 0;
      if (id !== runId.current) return;
      setStatus({
        kind: "analyzing",
        progress: done / total,
        message: `${finished}/${plural(games.length, "game")} · ${done}/${total} positions · depth ${d} · ${plural(p.size, "engine")}`,
      });
    };
    const tick = () => {
      done++;
      if (!frame) frame = requestAnimationFrame(report);
    };
    report();

    await Promise.all(
      games.map(async (game, i) => {
        try {
          const analysis = await analyseGame(game, p, d, tick);
          if (id !== runId.current) return;
          finished++;
          setSlots((prev) => prev.map((s, j) => (j === i ? { ...s, analysis } : s)));
        } catch (err) {
          if ((err as Error).message !== "cancelled") console.error(err);
        }
      }),
    );
    if (frame) cancelAnimationFrame(frame); // don't let a queued progress update overwrite "done"
    if (id === runId.current) setStatus({ kind: "done" });
  }, []);

  const evaluate = useCallback((fen: string) => {
    if (!pool.current) throw new Error("Engine not ready");
    return pool.current.evaluate(fen, depth, true);
  }, [depth]);

  return { slots, status, run, evaluate };
}
