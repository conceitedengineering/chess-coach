import { useEffect, useMemo, useRef } from "react";
import { ArrowLeft, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, ExternalLink, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChessBoard, type BoardArrow } from "@/components/ChessBoard";
import { EvalChart, formatSeconds, TimeStrip } from "@/components/EvalChart";
import { NoteBox } from "@/components/NoteBox";
import { positionKey } from "@/bank";
import { verdictWord } from "@/tablebase";
import { LinePanel, lineBoard, makeLine, useLineViewer, type Line } from "@/components/LinePlayer";
import { formatEval, keyMoments, THRESHOLDS, winPct, type GameAnalysis, type MoveInfo } from "@/analysis";
import {
  isError, MoveBadge, opponent, pct, platformName, ResultBadge, SanText, SEVERITY_TEXT, severity, sideName,
} from "@/lib/chess-ui";
import { cn } from "@/lib/utils";

export function GameReview({
  a,
  pos,
  onSeek,
  onBack,
}: {
  a: GameAnalysis;
  pos: number;
  onSeek: (pos: number) => void;
  onBack: () => void;
}) {
  const g = a.game;
  const n = a.moves.length;
  const m = pos > 0 ? a.moves[pos - 1] : null;
  const moments = keyMoments(a);
  const opp = opponent(g);
  const viewer = useLineViewer();
  const lineOpen = viewer.line !== null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (lineOpen) return; // the line player owns the arrow keys while it's open
      if (e.target instanceof Element && e.target.matches("input, select, textarea, [role=combobox]")) return;
      const next: Record<string, number> = { ArrowLeft: pos - 1, ArrowRight: pos + 1, Home: 0, End: n };
      if (e.key in next) {
        e.preventDefault();
        onSeek(Math.max(0, Math.min(n, next[e.key])));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pos, n, onSeek, lineOpen]);

  const arrows = useMemo<BoardArrow[]>(() => {
    if (!m || !isError(m)) return [];
    const mine = m.color === g.userColor;
    const out: BoardArrow[] = [{ uci: m.uci, kind: mine ? "bad" : "played" }];
    if (mine && m.bestUci && m.bestUci !== m.uci) out.push({ uci: m.bestUci, kind: "best" });
    return out;
  }, [m, g.userColor]);

  // Moving around the game leaves any line you were playing out.
  const seek = (p: number) => {
    viewer.close();
    onSeek(Math.max(0, Math.min(n, p)));
  };
  const lineView = viewer.line ? lineBoard(viewer.line, viewer.step) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft /> All games
        </Button>
        <h2 className="flex flex-1 items-center gap-2 text-lg font-semibold tracking-tight">
          <span className="truncate">
            {sideName(g.userColor)} vs {opp.name}
          </span>
          <ResultBadge result={g.result} reason={g.endReason} />
        </h2>
        {a.opening && (
          <p className="text-muted-foreground order-last w-full text-sm">
            {a.opening.eco} · {a.opening.name}
            {a.opening.leftBy && (
              <>
                {" · "}
                <button type="button" className="hover:text-foreground underline underline-offset-2" onClick={() => seek(a.opening!.bookPlies + 1)}>
                  {a.opening.leftBy === g.userColor ? "you" : "your opponent"} left known theory on move {Math.floor(a.opening.bookPlies / 2) + 1}
                </button>
              </>
            )}
          </p>
        )}
        <Button variant="outline" size="sm" asChild>
          <a href={g.url} target="_blank" rel="noopener noreferrer">
            Open on {platformName(g.platform)} <ExternalLink />
          </a>
        </Button>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,540px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 lg:sticky lg:top-6">
          {lineView ? (
            <ChessBoard fen={lineView.fen} orientation={g.userColor} lastMove={lineView.lastMove} arrows={lineView.arrows} />
          ) : (
            <ChessBoard fen={a.fens[pos]} orientation={g.userColor} lastMove={m?.uci} arrows={arrows} />
          )}
          <div className={cn("flex items-center justify-center gap-1", lineView && "invisible")}>
            <Button variant="outline" size="icon" onClick={() => seek(0)} aria-label="First move"><ChevronFirst /></Button>
            <Button variant="outline" size="icon" onClick={() => seek(pos - 1)} aria-label="Previous move"><ChevronLeft /></Button>
            <span className="w-20 text-center font-mono text-sm font-semibold tabular-nums">{formatEval(a.evals[pos])}</span>
            <Button variant="outline" size="icon" onClick={() => seek(pos + 1)} aria-label="Next move"><ChevronRight /></Button>
            <Button variant="outline" size="icon" onClick={() => seek(n)} aria-label="Last move"><ChevronLast /></Button>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {viewer.line ? (
            <LinePanel
              line={viewer.line}
              step={viewer.step}
              setStep={viewer.setStep}
              onExit={viewer.close}
              exitLabel="Back to game"
            />
          ) : (
            <Explain a={a} m={m} onPlayLine={viewer.open} />
          )}

          <Card size="sm">
            <CardHeader>
              <CardTitle>Your winning chances</CardTitle>
              <CardDescription>Click the chart to jump. Colored lines mark your mistakes.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                <EvalChart a={a} pos={pos} onSeek={seek} />
                {a.moves.some((x) => x.timeSpent !== undefined) && (
                  <>
                    <span className="text-muted-foreground text-xs">Time you spent per move</span>
                    <TimeStrip a={a} pos={pos} onSeek={seek} />
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Key moments <Badge variant="secondary">{moments.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {moments.length ? (
                <ol className="flex flex-col gap-1">
                  {moments.map((k) => (
                    <li key={k.ply}>
                      <button
                        type="button"
                        onClick={() => seek(k.ply + 1)}
                        className={cn(
                          "hover:bg-muted flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                          pos === k.ply + 1 && "bg-muted",
                        )}
                      >
                        <SanText className="w-24 shrink-0">{k.moveLabel} {k.san}</SanText>
                        <MoveBadge m={k} />
                        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                          {pct(k.wpBefore)} → {pct(k.wpAfter)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-muted-foreground text-sm">No mistakes or misses in this game.</p>
              )}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Moves</CardTitle>
            </CardHeader>
            <CardContent>
              <MoveList a={a} pos={pos} onSeek={seek} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Explain({
  a,
  m,
  onPlayLine,
}: {
  a: GameAnalysis;
  m: MoveInfo | null;
  onPlayLine: (line: Line, at?: number) => void;
}) {
  if (!m) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Starting position</CardTitle>
          <CardDescription>Step through with ← → or jump to a key moment.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const mine = m.color === a.game.userColor;
  const prev = a.moves[m.ply - 1];
  const next = a.moves[m.ply + 1];
  const yours = (wp: number) => (a.game.userColor === "w" ? wp : 100 - wp);

  const bestLine = () =>
    makeLine(
      `Best line instead of ${m.san}`,
      "best",
      m.fenBefore,
      a.evals[m.ply].pv,
      `With best play you keep about ${pct(m.wpBefore)} winning chances.`,
    );
  const playedLine = () =>
    makeLine(
      `What ${m.san} leads to`,
      "played",
      m.fenBefore,
      [m.uci, ...a.evals[m.ply + 1].pv],
      `After ${m.san}, best play from both sides leaves you about ${pct(m.wpAfter)} winning chances.`,
    );
  const lineFromHere = () =>
    makeLine(
      `Engine line after ${m.moveLabel} ${m.san}`,
      "best",
      m.fenAfter,
      a.evals[m.ply + 1].pv,
      `Your winning chances here: about ${pct(yours(winPct(a.evals[m.ply + 1])))}.`,
    );

  let body: React.ReactNode;
  if (!isError(m)) {
    const yourChances = mine ? m.wpAfter : 100 - m.wpAfter;
    body = (
      <p>
        {mine ? "You" : "Your opponent"} played {m.classification === "best" ? "the engine's top move" : "a solid move"}.
        Your winning chances: <span className="font-semibold">{pct(yourChances)}</span>.
      </p>
    );
  } else if (!mine) {
    body = (
      <p>
        Your opponent slipped: their winning chances fell from {pct(m.wpBefore)} to {pct(m.wpAfter)}.
        {next?.bestSan && <> Your best reply was <SanText className="text-best">{next.bestSan}</SanText>.</>}
      </p>
    );
  } else {
    body = (
      <>
        <p>
          You played <SanText className={SEVERITY_TEXT[severity(m)]}>{m.san}</SanText>. Your winning chances went from{" "}
          <span className="font-semibold">{pct(m.wpBefore)}</span> to <span className="font-semibold">{pct(m.wpAfter)}</span>.
          {m.bestSan && <> Better was <SanText className="text-best">{m.bestSan}</SanText> (green arrow).</>}
        </p>
        {m.isMiss && prev && prev.drop >= THRESHOLDS.mistake && (
          <p className="text-muted-foreground">
            Your opponent had just erred with <SanText>{prev.san}</SanText> (−{pct(prev.drop)} for them), and this move let it slip.
          </p>
        )}
      </>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SanText>{m.moveLabel} {m.san}</SanText>
          <MoveBadge m={m} />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm leading-relaxed">
        {body}
        {m.timeSpent !== undefined && m.clockBefore !== undefined && (
          <p className="text-muted-foreground text-xs tabular-nums">
            {mine ? "You" : "They"} took {formatSeconds(m.timeSpent)} · {formatSeconds(m.clockBefore)} was left on the clock
          </p>
        )}
        {isError(m) && mine && m.bestLine.length > 0 ? (
          <div className="bg-muted/60 flex flex-col gap-2 rounded-lg px-3 py-2">
            <div className="text-muted-foreground text-xs">Best line · click a move to jump there</div>
            <div className="flex flex-wrap gap-0.5">
              {m.bestLine.map((san, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onPlayLine(bestLine(), i + 1)}
                  className="hover:bg-background rounded px-1 font-mono text-sm"
                >
                  {san}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onPlayLine(bestLine())}>
                <PlayCircle /> Play out best line
              </Button>
              <Button size="sm" variant="outline" onClick={() => onPlayLine(playedLine())}>
                What {m.san} leads to
              </Button>
            </div>
          </div>
        ) : (
          a.evals[m.ply + 1].pv.length > 0 && (
            <Button size="sm" variant="outline" className="self-start" onClick={() => onPlayLine(lineFromHere())}>
              <PlayCircle /> Play out engine line from here
            </Button>
          )
        )}
        {mine && m.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {m.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
          </div>
        )}
        {m.tablebase && m.tablebase.before !== m.tablebase.after && (
          <p className="bg-muted/60 rounded-lg px-3 py-2 text-xs">
            <span className="font-semibold">Endgame tablebase:</span> with perfect play this was{" "}
            {verdictWord(m.tablebase.before)} for {mine ? "you" : "them"}; after {m.san} it's {verdictWord(m.tablebase.after)}.
          </p>
        )}
        {mine && isError(m) && <NoteBox posKey={positionKey(m.fenBefore)} />}
      </CardContent>
    </Card>
  );
}

function MoveList({ a, pos, onSeek }: { a: GameAnalysis; pos: number; onSeek: (p: number) => void }) {
  const current = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Scroll only the move list (not the page) to keep the current move visible.
    const el = current.current;
    const vp = el?.closest<HTMLElement>("[data-slot=scroll-area-viewport]");
    if (!el || !vp) return;
    const top = el.offsetTop - vp.clientHeight / 2 + el.offsetHeight / 2;
    vp.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [pos]);

  const rows: { num: string; w?: MoveInfo; b?: MoveInfo }[] = [];
  for (const mv of a.moves) {
    const num = mv.moveLabel.replace(/[.…]$/, "");
    if (mv.color === "w" || !rows.length || rows[rows.length - 1].num !== num) rows.push({ num });
    rows[rows.length - 1][mv.color] = mv;
  }

  const cell = (mv?: MoveInfo) => {
    if (!mv) return <span />;
    const mark = mv.color === a.game.userColor && isError(mv) ? severity(mv) : null;
    const isCurrent = pos === mv.ply + 1;
    return (
      <button
        ref={isCurrent ? current : undefined}
        type="button"
        onClick={() => onSeek(mv.ply + 1)}
        className={cn(
          "hover:bg-muted flex items-center gap-1.5 rounded-md px-2 py-1 text-left font-mono text-sm",
          isCurrent && "bg-primary text-primary-foreground hover:bg-primary",
          mark && !isCurrent && SEVERITY_TEXT[mark],
          (mark === "blunder" || mark === "miss") && "font-semibold",
        )}
      >
        {mv.san}
        {mark && <span className={cn("size-1.5 rounded-full", isCurrent ? "bg-primary-foreground" : "bg-current")} />}
      </button>
    );
  };

  return (
    <ScrollArea className="h-64 pr-3">
      <div className="relative grid grid-cols-[2.5rem_1fr_1fr] gap-x-1 gap-y-0.5">
        {rows.map((r) => (
          <div key={r.num} className="contents">
            <span className="text-muted-foreground py-1 font-mono text-sm tabular-nums">{r.num}.</span>
            {cell(r.w)}
            {cell(r.b)}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
