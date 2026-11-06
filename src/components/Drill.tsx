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

type Status = "solving" | "checking" | "correct" | "alt" | "wrong" | "revealed";

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
  const { a, m } = moments[index];
  const [status, setStatus] = useState<Status>("solving");
  const [message, setMessage] = useState("");
  const [solvedCount, setSolvedCount] = useState(0);
  const solved = status === "correct" || status === "alt" || status === "revealed";
  const prev = a.moves[m.ply - 1];
  const current = useRef(index);
  current.current = index;

  useEffect(() => {
    setStatus("solving");
    setMessage("");
  }, [index]);

  const onMove = useCallback(
    async (uci: string) => {
      if (uci === m.bestUci) {
        setStatus("correct");
        setSolvedCount((c) => c + 1);
        return;
      }
      const chess = new Chess(m.fenBefore);
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (chess.isCheckmate()) {
        setStatus("alt");
        setMessage("Checkmate. Even better.");
        setSolvedCount((c) => c + 1);
        return;
      }
      setStatus("checking");
      const asked = index;
      const e = await evaluate(chess.fen());
      if (current.current !== asked) return; // user moved on while the engine was thinking
      // The engine scores from the opponent's side (they are to move), so flip it.
      const wp = 100 - winPct({ cp: e.cp, mate: e.mate, best: null, pv: [] });
      if (m.wpBefore - wp < THRESHOLDS.inaccuracy) {
        setStatus("alt");
        setMessage(`That works too (${pct(wp)} winning chances). The engine's top move was ${m.bestSan}.`);
        setSolvedCount((c) => c + 1);
      } else {
        setStatus("wrong");
        setMessage(`That leaves you ${pct(wp)} winning chances, down from ${pct(m.wpBefore)}. Try again.`);
      }
    },
    [m, evaluate, index],
  );

  const arrows = useMemo<BoardArrow[]>(
    () =>
      solved
        ? [
            { uci: m.uci, kind: "bad" },
            ...(m.bestUci ? [{ uci: m.bestUci, kind: "best" as const }] : []),
          ]
        : [],
    [solved, m],
  );

  const go = (d: number) => onIndex((index + d + moments.length) % moments.length);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft /> Summary
        </Button>
        <h2 className="flex-1 text-lg font-semibold tracking-tight">
          Drill <span className="text-muted-foreground font-normal">{index + 1} / {moments.length}</span>
        </h2>
        <span className="text-muted-foreground text-sm">{solvedCount} solved</span>
      </div>
      <Progress value={((index + (solved ? 1 : 0)) / moments.length) * 100} className="h-1" />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,540px)_minmax(0,1fr)]">
        <ChessBoard
          fen={m.fenBefore}
          orientation={m.color}
          lastMove={prev?.uci}
          arrows={arrows}
          onMove={solved || status === "checking" ? undefined : onMove}
        />

        <Card>
          <CardHeader>
            <CardDescription>
              vs {opponent(a.game).name} · move {m.moveLabel.replace(/[.…]$/, "")} · <span className="capitalize">{m.phase}</span>
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

            {status === "solving" && <p className="text-muted-foreground">Drag or click a piece to move it.</p>}
            {status === "checking" && (
              <p className="text-muted-foreground flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Checking your move…
              </p>
            )}
            {status === "correct" && (
              <Feedback ok>
                Correct. <SanText>{m.bestSan}</SanText> is the engine's move.
              </Feedback>
            )}
            {status === "alt" && <Feedback ok>{message}</Feedback>}
            {status === "wrong" && <Feedback>{message}</Feedback>}
            {status === "revealed" && (
              <p>
                The best move was <SanText className="text-best">{m.bestSan}</SanText>.
              </p>
            )}

            {solved && (
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
            {!solved && (
              <Button variant="outline" onClick={() => setStatus("revealed")} disabled={status === "checking"}>
                <Eye /> Show answer
              </Button>
            )}
            <Button variant="ghost" onClick={() => go(-1)}>
              <ArrowLeft /> Previous
            </Button>
            <Button variant={solved ? "default" : "ghost"} onClick={() => go(1)}>
              Next <ArrowRight />
            </Button>
            <Button variant="link" className="ml-auto px-0" onClick={() => onOpenGame(a, m)}>
              Open game
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
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
