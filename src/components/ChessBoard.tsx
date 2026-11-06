import { useEffect, useRef } from "react";
import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import type { Key } from "@lichess-org/chessground/types";
import type { DrawShape } from "@lichess-org/chessground/draw";
import { Chess, type Square } from "chess.js";
import type { Color } from "@/games";

export interface BoardArrow {
  uci: string;
  kind: "best" | "bad" | "played";
}

const BRUSH: Record<BoardArrow["kind"], string> = { best: "green", bad: "red", played: "blue" };

interface Props {
  fen: string;
  orientation: Color;
  lastMove?: string | null; // uci
  arrows?: BoardArrow[];
  /** Extra CSS classes per square, e.g. { e4: "wrong" } (styled in board.css). */
  squareClasses?: Record<string, string>;
  /** When set, the side to move can play and this is called with the UCI move. */
  onMove?: (uci: string) => void;
}

function legalDests(chess: Chess) {
  const dests = new Map<Key, Key[]>();
  for (const m of chess.moves({ verbose: true })) {
    const list = dests.get(m.from as Key) ?? [];
    list.push(m.to as Key);
    dests.set(m.from as Key, list);
  }
  return dests;
}

const NO_CLASSES: Record<string, string> = {};

export function ChessBoard({ fen, orientation, lastMove, arrows = [], squareClasses = NO_CLASSES, onMove }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    if (!el.current) return;
    api.current = Chessground(el.current, {
      coordinates: true,
      animation: { enabled: true, duration: 180 },
      drawable: { enabled: false, visible: true },
      premovable: { enabled: false },
    });
    const ro = new ResizeObserver(() => api.current?.redrawAll());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      api.current?.destroy();
      api.current = null;
    };
  }, []);

  useEffect(() => {
    const chess = new Chess(fen);
    const turn = chess.turn() === "w" ? "white" : "black";
    const shapes: DrawShape[] = arrows.map((a) => ({
      orig: a.uci.slice(0, 2) as Key,
      dest: a.uci.slice(2, 4) as Key,
      brush: BRUSH[a.kind],
    }));
    api.current?.set({
      fen,
      orientation: orientation === "w" ? "white" : "black",
      turnColor: turn,
      check: chess.inCheck() ? turn : false,
      lastMove: lastMove ? [lastMove.slice(0, 2) as Key, lastMove.slice(2, 4) as Key] : undefined,
      viewOnly: false,
      movable: onMove
        ? {
            free: false,
            color: turn,
            dests: legalDests(chess),
            showDests: true,
            events: {
              after: (orig, dest) => {
                const piece = chess.get(orig as Square);
                const promo = piece?.type === "p" && (dest[1] === "8" || dest[1] === "1") ? "q" : "";
                onMoveRef.current?.(orig + dest + promo);
              },
            },
          }
        : { color: undefined, dests: new Map() },
      drawable: { autoShapes: shapes },
      highlight: { lastMove: true, check: true, custom: new Map(Object.entries(squareClasses) as [Key, string][]) },
    });
  }, [fen, orientation, lastMove, arrows, squareClasses, onMove]);

  return (
    // Inline size: chessground's unlayered .cg-wrap CSS would override Tailwind utilities.
    <div ref={el} style={{ width: "100%", aspectRatio: "1 / 1" }} />
  );
}
