import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, Loader2, XCircle } from "lucide-react";
import { Chess } from "chess.js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ChessBoard, type BoardArrow } from "@/components/ChessBoard";
import { THRESHOLDS, winPct, type GameAnalysis, type MoveInfo } from "@/analysis";
import type { EngineEval } from "@/engine";
import { MoveBadge, opponent, pct, SanText, sideName } from "@/lib/chess-ui";

/** How long a wrong move stays on the board before sliding back. */
const WRONG_MOVE_MS = 1100;

type Phase = "solving" | "showing-wrong" | "solved" | "revealed";

interface Attempt {
  uci: string;
  san: string;
  fenAfter: string;
  wp: number | null; // your winning chances after this move, once the engine has checked it
}

export function Drill({
  moments,
  index,
  onIndex,
  onBack,
  onOpenGame,
  evaluate,
}: {
  moments: { a: GameAnalysis; m: MoveInfo }[];
  index: number;
  onIndex: (i: number) => void;
  onBack: () => void;
  onOpenGame: (a: GameAnalysis, m: MoveInfo) => void;
  evaluate: (fen: string) => Promise<EngineEval>;
}) {
  const [solved, setSolved] = useState<Set<number>>(() => new Set());
  const go = (d: number) => onIndex((index + d + moments.length) % moments.length);
  const { a, m } = moments[index];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft /> Summary
        </Button>
        <h2 className="flex-1 text-lg font-semibold tracking-tight">
          Drill <span className="text-muted-foreground font-normal">{index + 1} / {moments.length}</span>
        </h2>
        <span className="text-muted-foreground text-sm">{solved.size} solved</span>
      </div>
      <Progress value={(solved.size / moments.length) * 100} className="h-1" />
      {/* key: every puzzle starts from a clean slate */}
      <Puzzle
        key={index}
        a={a}
        m={m}
        evaluate={evaluate}
        onSolved={() => setSolved((s) => new Set(s).add(index))}
        onPrev={() => go(-1)}
        onNext={() => go(1)}
        onOpenGame={() => onOpenGame(a, m)}
      />
    </div>
  );
}

function Puzzle({
  a,
  m,
  evaluate,
  onSolved,
  onPrev,
  onNext,
  onOpenGame,
}: {
  a: GameAnalysis;
  m: MoveInfo;
  evaluate: (fen: string) => Promise<EngineEval>;
  onSolved: () => void;
  onPrev: () => void;
  onNext: () => void;
  onOpenGame: () => void;
}) {
  const prev = a.moves[m.ply - 1];
  const [phase, setPhase] = useState<Phase>("solving");
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [solvedFen, setSolvedFen] = useState<{ fen: string; uci: string } | null>(null);
  const timer = useRef<number>(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      window.clearTimeout(timer.current);
    };
  }, []);

  const done = phase === "solved" || phase === "revealed";
  const last = attempts[attempts.length - 1];

  const onMove = useCallback(
    (uci: string) => {
      const chess = new Chess(m.fenBefore);
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      const fenAfter = chess.fen();

      if (uci === m.bestUci || chess.isCheckmate()) {
        setSolvedFen({ fen: fenAfter, uci });
        setPhase("solved");
        onSolved();
        return;
      }

      // Wrong: leave the move on the board in red, then slide it back so you can try again.
      const attempt: Attempt = { uci, san: move.san, fenAfter, wp: null };
      setAttempts((list) => [...list, attempt]);
      setPhase("showing-wrong");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setPhase((p) => (p === "showing-wrong" ? "solving" : p)), WRONG_MOVE_MS);

      // Meanwhile, ask the engine how much it costs. It scores from the opponent's side, so flip it.
      evaluate(fenAfter)
        .then((e) => {
          if (!alive.current) return;
          const wp = 100 - winPct({ cp: e.cp, mate: e.mate, best: null, pv: [] });
          setAttempts((list) => list.map((x) => (x === attempt ? { ...x, wp } : x)));
        })
        .catch(() => {});
    },
    [m, evaluate, onSolved],
  );

  // What the board shows in each phase.
  const board = useMemo(() => {
    const red = (uci: string) => ({ [uci.slice(0, 2)]: "wrong", [uci.slice(2, 4)]: "wrong" });
    const green = (uci: string) => ({ [uci.slice(0, 2)]: "right", [uci.slice(2, 4)]: "right" });
    switch (phase) {
      case "showing-wrong":
        return { fen: last.fenAfter, lastMove: null, squareClasses: red(last.uci), arrows: [] as BoardArrow[] };
      case "solved":
        return { fen: solvedFen!.fen, lastMove: null, squareClasses: green(solvedFen!.uci), arrows: [] as BoardArrow[] };
      case "revealed":
        return {
          fen: m.fenBefore,
          lastMove: prev?.uci ?? null,
          squareClasses: {},
          arrows: [{ uci: m.uci, kind: "bad" }, ...(m.bestUci ? [{ uci: m.bestUci, kind: "best" }] : [])] as BoardArrow[],
        };
      default:
        // Back to the puzzle; the last wrong try stays as a faint red arrow.
        return {
          fen: m.fenBefore,
          lastMove: prev?.uci ?? null,
          squareClasses: {},
          arrows: last ? ([{ uci: last.uci, kind: "bad" }] as BoardArrow[]) : [],
        };
    }
  }, [phase, last, solvedFen, m, prev]);

  return (
    <>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,540px)_minmax(0,1fr)]">
        <ChessBoard
          fen={board.fen}
          orientation={m.color}
          lastMove={board.lastMove}
          arrows={board.arrows}
          squareClasses={board.squareClasses}
          onMove={phase === "solving" ? onMove : undefined}
        />

        <Card>
          <CardHeader>
            <CardDescription>
              vs {opponent(a.game).name} · move {m.moveLabel.replace(/[.…]$/, "")} ·{" "}
              <span className="capitalize">{m.phase}</span>
            </CardDescription>
            <CardTitle className="text-lg">{sideName(m.color)} to move</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm leading-relaxed">
            <p>
              {m.isMiss && prev ? (
                <>Your opponent just played <SanText>{prev.san}</SanText>, a mistake. Punish it.</>
              ) : (
                "Find the best move."
              )}
            </p>

            {!done && !last && <p className="text-muted-foreground">Drag or click a piece to move it.</p>}

            {!done && last && (
              <Feedback>
                <span className="font-semibold">Not the best move. Try again.</span>
                <br />
                <AttemptDetail attempt={last} wpBefore={m.wpBefore} />
              </Feedback>
            )}

            {phase === "solved" && (
              <Feedback ok>
                <span className="font-semibold">
                  <SanText>{m.bestSan}</SanText> is the best move.
                </span>{" "}
                {attempts.length ? `Found it after ${attempts.length} wrong ${attempts.length === 1 ? "try" : "tries"}.` : "First try."}
              </Feedback>
            )}
            {phase === "revealed" && (
              <p>
                The best move was <SanText className="text-best">{m.bestSan}</SanText> (green arrow).
              </p>
            )}

            {attempts.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground text-xs">Tried</span>
                {attempts.map((t, i) => (
                  <Badge key={i} className="bg-blunder/15 text-blunder font-mono">
                    {t.san}
                    {t.wp !== null && <span className="font-sans opacity-75">{pct(t.wp)}</span>}
                  </Badge>
                ))}
              </div>
            )}

            {done && (
              <div className="flex flex-col gap-3 border-t pt-4">
                <p className="flex flex-wrap items-center gap-2">
                  In the game you played <SanText className="text-blunder">{m.san}</SanText> <MoveBadge m={m} />
                  <span className="text-muted-foreground tabular-nums">{pct(m.wpBefore)} → {pct(m.wpAfter)}</span>
                </p>
                {m.bestLine.length > 0 && (
                  <div className="bg-muted/60 rounded-lg px-3 py-2">
                    <div className="text-muted-foreground mb-0.5 text-xs">Best line</div>
                    <SanText>{m.bestLine.join(" ")}</SanText>
                  </div>
                )}
                {m.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
                  </div>
                )}
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            {!done && (
              <Button variant="outline" onClick={() => setPhase("revealed")}>
                <Eye /> Show answer
              </Button>
            )}
            <Button variant="ghost" onClick={onPrev}>
              <ArrowLeft /> Previous
            </Button>
            <Button variant={done ? "default" : "ghost"} onClick={onNext}>
              Next <ArrowRight />
            </Button>
            <Button variant="link" className="ml-auto px-0" onClick={onOpenGame}>
              Open game
            </Button>
          </CardFooter>
        </Card>
      </div>
    </>
  );
}

function AttemptDetail({ attempt, wpBefore }: { attempt: Attempt; wpBefore: number }) {
  if (attempt.wp === null) {
    return (
      <span className="inline-flex items-center gap-1.5 opacity-80">
        <Loader2 className="size-3.5 animate-spin" /> Checking what <SanText>{attempt.san}</SanText> costs…
      </span>
    );
  }
  const close = wpBefore - attempt.wp < THRESHOLDS.inaccuracy;
  return close ? (
    <span className="opacity-90">
      <SanText>{attempt.san}</SanText> is decent ({pct(attempt.wp)} winning chances), but there's a stronger move.
    </span>
  ) : (
    <span className="opacity-90">
      <SanText>{attempt.san}</SanText> drops your winning chances to {pct(attempt.wp)} (from {pct(wpBefore)}).
    </span>
  );
}

function Feedback({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <div className={ok ? "bg-best/10 text-best flex gap-2 rounded-lg p-3" : "bg-blunder/10 text-blunder flex gap-2 rounded-lg p-3"}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
