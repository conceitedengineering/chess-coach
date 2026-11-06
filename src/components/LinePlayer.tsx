// Plays out an engine line move by move: the board follows `step`, this panel scrubs it.
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { Chess } from "chess.js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import type { BoardArrow } from "@/components/ChessBoard";
import { cn } from "@/lib/utils";

export interface Line {
  title: string;
  kind: "best" | "played";
  /** One sentence on where the line ends up, e.g. "You keep 78% winning chances." */
  outcome?: string;
  startFen: string;
  ucis: string[];
  sans: string[];
  fens: string[]; // fens[0] = start, fens[i] = after i moves
  labels: string[]; // move numbers, e.g. "9." / "9…"
}

const MAX_PLIES = 12;
const AUTOPLAY_MS = 900;

/** Builds a playable line from a start position and UCI moves (stops at the first illegal move). */
export function makeLine(title: string, kind: Line["kind"], startFen: string, ucis: string[], outcome?: string): Line {
  const chess = new Chess(startFen);
  const line: Line = { title, kind, outcome, startFen, ucis: [], sans: [], fens: [startFen], labels: [] };
  for (const u of ucis.slice(0, MAX_PLIES)) {
    const n = chess.moveNumber();
    const color = chess.turn();
    try {
      const m = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      line.ucis.push(u);
      line.sans.push(m.san);
      line.fens.push(chess.fen());
      line.labels.push(`${n}${color === "w" ? "." : "…"}`);
    } catch {
      break;
    }
  }
  return line;
}

/** Board props for a line at a given step: last move highlighted, next move as an arrow. */
export function lineBoard(line: Line, step: number) {
  const next = line.ucis[step];
  const arrows: BoardArrow[] = next
    ? [{ uci: next, kind: step === 0 ? (line.kind === "best" ? "best" : "bad") : "played" }]
    : [];
  return { fen: line.fens[step], lastMove: line.ucis[step - 1] ?? null, arrows };
}

/** State for viewing one line at a time. */
export function useLineViewer() {
  const [line, setLine] = useState<Line | null>(null);
  const [step, setStepRaw] = useState(0);
  const setStep = (s: number) => setStepRaw(line ? Math.max(0, Math.min(line.ucis.length, s)) : 0);
  return {
    line,
    step,
    setStep,
    open: (l: Line, at = 0) => {
      setLine(l);
      setStepRaw(Math.max(0, Math.min(l.ucis.length, at)));
    },
    close: () => setLine(null),
  };
}

export function LinePanel({
  line,
  step,
  setStep,
  onExit,
  exitLabel,
}: {
  line: Line;
  step: number;
  setStep: (s: number) => void;
  onExit: () => void;
  exitLabel: string;
}) {
  const n = line.ucis.length;
  const [playing, setPlaying] = useState(false);

  // Autoplay: step forward until the end of the line.
  useEffect(() => {
    if (!playing) return;
    if (step >= n) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setStep(step + 1), AUTOPLAY_MS);
    return () => window.clearTimeout(t);
  }, [playing, step, n, setStep]);

  // Arrow keys scrub the line while it's open; Escape leaves it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.matches("input, select, textarea, [role=slider]")) return;
      const map: Record<string, number> = { ArrowLeft: step - 1, ArrowRight: step + 1, Home: 0, End: n };
      if (e.key in map) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setPlaying(false);
        setStep(map[e.key]);
      } else if (e.key === "Escape") {
        onExit();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [step, n, setStep, onExit]);

  const go = (s: number) => {
    setPlaying(false);
    setStep(s);
  };

  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <Badge className={line.kind === "best" ? "bg-best/15 text-best" : "bg-blunder/15 text-blunder"}>
            {line.kind === "best" ? "Best line" : "Your move"}
          </Badge>
          Step {step} of {n}
        </CardDescription>
        <CardTitle className="text-lg">{line.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {line.outcome && <p className="text-muted-foreground">{line.outcome}</p>}

        <Slider
          value={[step]}
          min={0}
          max={n}
          step={1}
          onValueChange={([v]) => go(v)}
          aria-label="Scrub through the line"
        />

        <div className="flex items-center justify-center gap-1">
          <Button variant="outline" size="icon" onClick={() => go(0)} aria-label="Start of line"><ChevronFirst /></Button>
          <Button variant="outline" size="icon" onClick={() => go(step - 1)} aria-label="Previous step"><ChevronLeft /></Button>
          <Button
            size="icon-lg"
            onClick={() => {
              if (step >= n) setStep(0);
              setPlaying((p) => !p);
            }}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause /> : <Play />}
          </Button>
          <Button variant="outline" size="icon" onClick={() => go(step + 1)} aria-label="Next step"><ChevronRight /></Button>
          <Button variant="outline" size="icon" onClick={() => go(n)} aria-label="End of line"><ChevronLast /></Button>
        </div>

        <div className="flex flex-wrap gap-1">
          {line.sans.map((san, i) => {
            const showNumber = i === 0 || line.labels[i].endsWith(".");
            const active = step === i + 1;
            return (
              <button
                key={i}
                type="button"
                onClick={() => go(i + 1)}
                className={cn(
                  "hover:bg-muted rounded-md px-1.5 py-0.5 font-mono text-sm transition-colors",
                  active && "bg-primary text-primary-foreground hover:bg-primary",
                  step < i + 1 && !active && "text-muted-foreground",
                  i === 0 && !active && (line.kind === "best" ? "text-best" : "text-blunder"),
                )}
              >
                {showNumber && <span className="opacity-60">{line.labels[i]} </span>}
                {san}
              </button>
            );
          })}
        </div>

        <Button variant="secondary" onClick={onExit} className="self-start">
          <ArrowLeft /> {exitLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
