import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, Loader2, PlayCircle, XCircle } from "lucide-react";
import { Chess } from "chess.js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ChessBoard, type BoardArrow } from "@/components/ChessBoard";
import { LinePanel, lineBoard, makeLine, useLineViewer } from "@/components/LinePlayer";
import { THRESHOLDS, winPct } from "@/analysis";
import { nextReviewText, type BankItem } from "@/bank";
import type { EngineEval } from "@/engine";
import { MoveBadge, pct, SanText, sideName } from "@/lib/chess-ui";

/** How long a wrong move stays on the board before sliding back. */
const WRONG_MOVE_MS = 1100;

type Phase = "solving" | "showing-wrong" | "solved" | "revealed";

interface Attempt {
  uci: string;
  san: string;
  fenAfter: string;
  wp: number | null; // your winning chances after this move, once the engine has checked it
  pv: string[]; // the engine's continuation after this move
}

export function Drill({
  items,
  title,
  index,
  onIndex,
  onBack,
  onOpenGame,
  onResult,
  scheduleOf,
  evaluate,
}: {
  items: BankItem[];
  title: string;
  index: number;
  onIndex: (i: number) => void;
  onBack: () => void;
  onOpenGame: (it: BankItem) => void;
  onResult: (key: string, firstTry: boolean) => void;
  scheduleOf: (key: string) => BankItem | undefined;
  evaluate: (fen: string) => Promise<EngineEval>;
}) {
  const [solved, setSolved] = useState<Set<string>>(() => new Set());
  const go = (d: number) => onIndex((index + d + items.length) % items.length);
  const it = items[index];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft /> Summary
        </Button>
        <h2 className="flex-1 text-lg font-semibold tracking-tight">
          {title} <span className="text-muted-foreground font-normal">{index + 1} / {items.length}</span>
        </h2>
        <span className="text-muted-foreground text-sm">{solved.size} solved first try</span>
      </div>
      <Progress value={(solved.size / items.length) * 100} className="h-1" />
      {/* key: every puzzle starts from a clean slate */}
      <Puzzle
        key={`${index}:${it.key}`}
        it={it}
        scheduled={scheduleOf(it.key)}
        evaluate={evaluate}
        onResult={(firstTry) => {
          if (firstTry) setSolved((s) => new Set(s).add(it.key));
          onResult(it.key, firstTry);
        }}
        onPrev={() => go(-1)}
        onNext={() => go(1)}
        onOpenGame={() => onOpenGame(it)}
      />
    </div>
  );
}

function Puzzle({
  it,
  scheduled,
  evaluate,
  onResult,
  onPrev,
  onNext,
  onOpenGame,
}: {
  it: BankItem;
  /** The bank's copy of this position, for its review schedule. */
  scheduled?: BankItem;
  evaluate: (fen: string) => Promise<EngineEval>;
  onResult: (firstTry: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  onOpenGame: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("solving");
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const attemptsRef = useRef(0);
  attemptsRef.current = attempts.length;
  const [solvedFen, setSolvedFen] = useState<{ fen: string; uci: string } | null>(null);
  const viewer = useLineViewer();
  const bestSans = useMemo(() => makeLine("", "best", it.fen, it.bestPv).sans, [it]);
  // Report once per puzzle: a first-try solve, or anything else (wrong tries, revealed).
  const reported = useRef(false);
  const report = (firstTry: boolean) => {
    if (reported.current) return;
    reported.current = true;
    onResult(firstTry);
  };
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
      const chess = new Chess(it.fen);
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      const fenAfter = chess.fen();

      if (uci === it.bestUci || chess.isCheckmate()) {
        setSolvedFen({ fen: fenAfter, uci });
        setPhase("solved");
        report(attemptsRef.current === 0);
        return;
      }

      // Wrong: leave the move on the board in red, then slide it back so you can try again.
      const attempt: Attempt = { uci, san: move.san, fenAfter, wp: null, pv: [] };
      setAttempts((list) => [...list, attempt]);
      setPhase("showing-wrong");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setPhase((p) => (p === "showing-wrong" ? "solving" : p)), WRONG_MOVE_MS);

      // Meanwhile, ask the engine how much it costs. It scores from the opponent's side, so flip it.
      evaluate(fenAfter)
        .then((e) => {
          if (!alive.current) return;
          const wp = 100 - winPct({ cp: e.cp, mate: e.mate, best: null, pv: [] });
          setAttempts((list) => list.map((x) => (x === attempt ? { ...x, wp, pv: e.pv } : x)));
        })
        .catch(() => {});
    },
    [it, evaluate],
  );

  // Lines you can play out on the board.
  const moveNo = it.moveLabel.replace(/[.…]$/, "");
  const bestLine = () =>
    makeLine(
      `Best line from move ${moveNo}`,
      "best",
      it.fen,
      it.bestPv,
      `With best play you keep about ${pct(it.wpBefore)} winning chances.`,
    );
  const attemptLine = (t: Attempt) =>
    makeLine(
      `What happens after ${t.san}`,
      "played",
      it.fen,
      [t.uci, ...t.pv],
      t.wp !== null ? `The engine's best replies leave you about ${pct(t.wp)} winning chances (best play keeps ${pct(it.wpBefore)}).` : undefined,
    );
  const gameLine = () =>
    makeLine(
      `What happened after ${it.playedSan} in the game`,
      "played",
      it.fen,
      [it.playedUci, ...it.playedPv],
      `After ${it.playedSan}, best play from both sides leaves you about ${pct(it.wpAfter)} winning chances.`,
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
          fen: it.fen,
          lastMove: it.prevUci ?? null,
          squareClasses: {},
          arrows: [{ uci: it.playedUci, kind: "bad" }, ...(it.bestUci ? [{ uci: it.bestUci, kind: "best" }] : [])] as BoardArrow[],
        };
      default:
        // Back to the puzzle; the last wrong try stays as a faint red arrow.
        return {
          fen: it.fen,
          lastMove: it.prevUci ?? null,
          squareClasses: {},
          arrows: last ? ([{ uci: last.uci, kind: "bad" }] as BoardArrow[]) : [],
        };
    }
  }, [phase, last, solvedFen, it]);

  const lineView = viewer.line ? lineBoard(viewer.line, viewer.step) : null;

  return (
    <>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,540px)_minmax(0,1fr)]">
        {lineView ? (
          <ChessBoard fen={lineView.fen} orientation={it.color} lastMove={lineView.lastMove} arrows={lineView.arrows} />
        ) : (
          <ChessBoard
            fen={board.fen}
            orientation={it.color}
            lastMove={board.lastMove}
            arrows={board.arrows}
            squareClasses={board.squareClasses}
            onMove={phase === "solving" ? onMove : undefined}
          />
        )}

        {viewer.line ? (
          <LinePanel
            line={viewer.line}
            step={viewer.step}
            setStep={viewer.setStep}
            onExit={viewer.close}
            exitLabel={done ? "Back to drill" : "Back to puzzle"}
          />
        ) : (
        <Card>
          <CardHeader>
            <CardDescription>
              vs {it.opponent} · move {it.moveLabel.replace(/[.…]$/, "")} ·{" "}
              <span className="capitalize">{it.phase}</span>
            </CardDescription>
            <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
              {sideName(it.color)} to move
              {scheduled && scheduled.gameIds.length > 1 && (
                <Badge className="bg-mistake/15 text-mistake">Same mistake in {scheduled.gameIds.length} games</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm leading-relaxed">
            <p>
              {it.isMiss && it.prevSan ? (
                <>Your opponent just played <SanText>{it.prevSan}</SanText>, a mistake. Punish it.</>
              ) : (
                "Find the best move."
              )}
            </p>

            {!done && !last && <p className="text-muted-foreground">Drag or click a piece to move it.</p>}

            {!done && last && (
              <Feedback>
                <span className="font-semibold">Not the best move. Try again.</span>
                <br />
                <AttemptDetail attempt={last} wpBefore={it.wpBefore} />
              </Feedback>
            )}

            {phase === "solved" && (
              <Feedback ok>
                <span className="font-semibold">
                  <SanText>{it.bestSan}</SanText> is the best move.
                </span>{" "}
                {attempts.length ? `Found it after ${attempts.length} wrong ${attempts.length === 1 ? "try" : "tries"}.` : "First try."}
              </Feedback>
            )}
            {phase === "revealed" && (
              <p>
                The best move was <SanText className="text-best">{it.bestSan}</SanText> (green arrow).
              </p>
            )}

            {attempts.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground text-xs">Tried</span>
                {attempts.map((t, i) => (
                  <Badge key={i} asChild className="bg-blunder/15 text-blunder hover:bg-blunder/25 font-mono">
                    <button
                      type="button"
                      disabled={t.wp === null}
                      onClick={() => viewer.open(attemptLine(t), 1)}
                      title={`Play out what happens after ${t.san}`}
                      className="cursor-pointer disabled:cursor-wait"
                    >
                      {t.san}
                      {t.wp !== null && <span className="font-sans opacity-75">{pct(t.wp)}</span>}
                      {t.wp !== null && <PlayCircle />}
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {done && scheduled && (
              <p className="text-muted-foreground text-xs">
                {phase === "solved" && attempts.length === 0
                  ? `Solved first try. Next review ${nextReviewText(scheduled)}.`
                  : `This one comes back ${nextReviewText(scheduled)}.`}
              </p>
            )}

            {done && (
              <div className="flex flex-col gap-3 border-t pt-4">
                <p className="flex flex-wrap items-center gap-2">
                  In the game you played <SanText className="text-blunder">{it.playedSan}</SanText> <MoveBadge m={it} />
                  <span className="text-muted-foreground tabular-nums">{pct(it.wpBefore)} → {pct(it.wpAfter)}</span>
                </p>
                {bestSans.length > 0 && (
                  <div className="bg-muted/60 flex flex-col gap-2 rounded-lg px-3 py-2">
                    <div className="text-muted-foreground text-xs">Best line · click a move to jump there</div>
                    <div className="flex flex-wrap gap-0.5">
                      {bestSans.map((san, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => viewer.open(bestLine(), i + 1)}
                          className="hover:bg-background rounded px-1 font-mono text-sm"
                        >
                          {san}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => viewer.open(bestLine(), 0)}>
                        <PlayCircle /> Play out best line
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => viewer.open(gameLine(), 0)}>
                        What happened after {it.playedSan}
                      </Button>
                    </div>
                  </div>
                )}
                {it.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {it.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
                  </div>
                )}
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            {!done && (
              <Button
                variant="outline"
                onClick={() => {
                  setPhase("revealed");
                  report(false);
                }}
              >
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
        )}
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
