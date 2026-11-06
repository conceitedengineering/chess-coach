import { ChevronRight, Lightbulb, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { keyMoments, type GameAnalysis, type MoveInfo, type Phase } from "@/analysis";
import { opponent, pct, plural, ResultBadge, sideName } from "@/lib/chess-ui";
import { cn } from "@/lib/utils";
import type { Slot } from "@/useCoach";

const TIPS: Record<string, string> = {
  "Left material hanging": "Before each move, ask what your opponent can capture or attack next.",
  "Missed tactic": "When your opponent slips, look at every check, capture and threat first.",
  "Threw away a winning position": "When ahead, simplify: trade pieces and shut down counterplay.",
  "Allowed mate": "After your move, list your opponent's checks. King safety first.",
  "Missed mate": "Look for forcing checks first. You had a mate on the board.",
};

export function allMoments(slots: Slot[]): { a: GameAnalysis; m: MoveInfo }[] {
  return slots.flatMap((s) => (s.analysis ? keyMoments(s.analysis).map((m) => ({ a: s.analysis!, m })) : []));
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <Card size="sm">
      <CardContent>
        <div className={cn("text-2xl font-semibold tabular-nums tracking-tight", className)}>{value}</div>
        <div className="text-muted-foreground text-xs">{label}</div>
      </CardContent>
    </Card>
  );
}

export function Summary({
  slots,
  onOpenGame,
  onDrill,
}: {
  slots: Slot[];
  onOpenGame: (i: number) => void;
  onDrill: () => void;
}) {
  const analyses = slots.flatMap((s) => (s.analysis ? [s.analysis] : []));
  const games = slots.map((s) => s.game);
  const w = games.filter((g) => g.result === "win").length;
  const l = games.filter((g) => g.result === "loss").length;
  const sum = (k: keyof GameAnalysis["counts"]) => analyses.reduce((s, a) => s + a.counts[k], 0);
  const acc = analyses.length ? analyses.reduce((s, a) => s + a.accuracy, 0) / analyses.length : null;
  const moments = allMoments(slots);

  const phases: Record<Phase, number> = { opening: 0, middlegame: 0, endgame: 0 };
  const tagCounts = new Map<string, number>();
  for (const { m } of moments) {
    phases[m.phase]++;
    for (const t of m.tags) {
      const key = t.replace(/ in \d+$/, "");
      tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1);
    }
  }
  const tags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);
  const maxPhase = Math.max(1, ...Object.values(phases));
  const topTip = tags.find(([t]) => TIPS[t]);
  const pending = slots.length - analyses.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Record (W–L–D)" value={`${w}–${l}–${games.length - w - l}`} />
        <Stat label="Avg accuracy" value={acc === null ? "…" : pct(acc)} />
        <Stat label="Blunders" value={String(sum("blunder"))} className="text-blunder" />
        <Stat label="Mistakes" value={String(sum("mistake"))} className="text-mistake" />
        <Stat label="Inaccuracies" value={String(sum("inaccuracy"))} className="text-inaccuracy" />
        <Stat label="Missed chances" value={String(sum("miss"))} className="text-miss" />
      </div>

      {analyses.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Where your errors happened</CardTitle>
              <CardDescription>Mistakes, blunders and misses by game phase</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {(["opening", "middlegame", "endgame"] as const).map((p) => (
                <div key={p} className="grid grid-cols-[88px_1fr_24px] items-center gap-3 text-sm">
                  <span className="text-muted-foreground capitalize">{p}</span>
                  <div className="bg-muted h-2 overflow-hidden rounded-full">
                    <div className="bg-mistake h-full rounded-full transition-all" style={{ width: `${(phases[p] / maxPhase) * 100}%` }} />
                  </div>
                  <span className="text-right tabular-nums">{phases[p]}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Patterns</CardTitle>
              <CardDescription>What kept going wrong</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {tags.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map(([t, n]) => (
                    <Badge key={t} variant="secondary">
                      {t} <span className="text-muted-foreground">×{n}</span>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No recurring patterns.</p>
              )}
              {topTip && (
                <div className="bg-muted/60 flex gap-2 rounded-lg p-3 text-sm">
                  <Lightbulb className="text-inaccuracy mt-0.5 size-4 shrink-0" />
                  <p>{TIPS[topTip[0]]}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Practice</CardTitle>
              <CardDescription>
                {moments.length
                  ? `Replay the ${plural(moments.length, "position")} where you went wrong and find the better move.`
                  : "No critical positions to drill. Clean day."}
              </CardDescription>
            </CardHeader>
            {moments.length > 0 && (
              <CardContent className="mt-auto">
                <Button onClick={onDrill} className="w-full">
                  <Target /> Start drill
                </Button>
              </CardContent>
            )}
          </Card>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Games</h2>
          {pending > 0 && <span className="text-muted-foreground text-sm">{pending} still analyzing</span>}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {slots.map((s, i) => (
            <GameCard key={s.game.id} slot={s} onClick={() => onOpenGame(i)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function GameCard({ slot, onClick }: { slot: Slot; onClick: () => void }) {
  const g = slot.game;
  const a = slot.analysis;
  const opp = opponent(g);
  const time = new Date(g.endTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!a}
      className="group text-left disabled:cursor-progress focus-visible:outline-none"
    >
      <Card className="group-hover:ring-foreground/25 group-focus-visible:ring-ring h-full transition-shadow group-focus-visible:ring-2">
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <ResultBadge result={g.result} />
            <span className="truncate font-medium">
              vs {opp.name}
              {opp.rating && <span className="text-muted-foreground font-normal"> ({opp.rating})</span>}
            </span>
            <span className="text-muted-foreground ml-auto shrink-0 text-xs capitalize">
              {sideName(g.userColor)} · {g.timeClass} · {time}
            </span>
          </div>
          {g.opening && <p className="text-muted-foreground truncate text-xs">{g.opening}</p>}
          {a ? (
            <div className="flex items-center gap-3 text-sm">
              <span>
                Accuracy <span className="font-semibold tabular-nums">{pct(a.accuracy)}</span>
              </span>
              {a.counts.blunder > 0 && <span className="text-blunder">{plural(a.counts.blunder, "blunder")}</span>}
              {a.counts.mistake > 0 && <span className="text-mistake">{plural(a.counts.mistake, "mistake")}</span>}
              {a.counts.miss > 0 && <span className="text-miss">{plural(a.counts.miss, "miss")}</span>}
              <ChevronRight className="text-muted-foreground ml-auto size-4 transition-transform group-hover:translate-x-0.5" />
            </div>
          ) : (
            <Skeleton className="h-5 w-56" />
          )}
        </CardContent>
      </Card>
    </button>
  );
}
