import { ChevronRight, Lightbulb, Repeat, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { keyMoments, type GameAnalysis, type MoveInfo, type Phase } from "@/analysis";
import { END_REASON_ICON, opponent, pct, plural, ResultBadge, sideName } from "@/lib/chess-ui";
import { END_REASON_LABEL, type EndReason, type GameRecord } from "@/games";
import { cn } from "@/lib/utils";
import type { Slot } from "@/useCoach";
import { Trends } from "@/components/Trends";
import type { DaySummary } from "@/days";

const TIPS: Record<string, string> = {
  "Left material hanging": "Before each move, ask what your opponent can capture or attack next.",
  "Missed tactic": "When your opponent slips, look at every check, capture and threat first.",
  "Threw away a winning position": "When ahead, simplify: trade pieces and shut down counterplay.",
  "Allowed mate": "After your move, list your opponent's checks. King safety first.",
  "Missed mate": "Look for forcing checks first. You had a mate on the board.",
  "Ignored a threat": "After every opponent move, ask: what does it attack? Answer that before your own plan.",
  "Missed their check": "Before you move, list every check your opponent would have next.",
  "Missed free material": "When a piece is offered, check whether it's really free, then take it.",
  "Moved too fast": "Slow down on captures and checks: take three seconds for a blunder check.",
  "Time trouble": "Spend less time early; keep at least a third of your clock for the middlegame.",
  "Long think, then mistake": "If you're thinking long, pick two candidate moves and compare them, then commit.",
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
  bank,
  onReview,
  trendDays,
}: {
  slots: Slot[];
  onOpenGame: (i: number) => void;
  onDrill: () => void;
  bank: { size: number; due: number; recentTags: [string, number][] };
  onReview: () => void;
  trendDays: DaySummary[];
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
  // The tip follows your most common mistake over the last two weeks, falling back to today.
  const topTip = bank.recentTags.find(([t]) => TIPS[t]) ?? tags.find(([t]) => TIPS[t]);
  const recurring = bank.recentTags.filter(([, n]) => n >= 3).slice(0, 3);
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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <EndingsCard games={games} />

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
              {recurring.length > 0 && (
                <p className="text-muted-foreground text-xs">
                  Last 14 days:{" "}
                  {recurring.map(([t, n], i) => (
                    <span key={t}>
                      {i > 0 && " · "}
                      <span className="text-foreground">{t}</span> ×{n}
                    </span>
                  ))}
                </p>
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
            <CardContent className="mt-auto flex flex-col gap-2">
              {moments.length > 0 && (
                <Button onClick={onDrill} className="w-full">
                  <Target /> Start drill
                </Button>
              )}
              <Button variant="outline" onClick={onReview} disabled={bank.due === 0} className="w-full">
                <Repeat /> {bank.due ? `Review ${bank.due} due` : "Nothing due for review"}
              </Button>
              <p className="text-muted-foreground text-center text-xs">
                {plural(bank.size, "position")} saved · they come back after 1, 3, 7, 21 and 60 days
              </p>
            </CardContent>
          </Card>

          <OpeningsCard analyses={analyses} />
        </div>
      )}

      {analyses.length > 0 && <Trends days={trendDays} />}

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

function OpeningsCard({ analyses }: { analyses: GameAnalysis[] }) {
  const groups = new Map<string, { games: number; w: number; l: number; errors: number; book: number; leftByYou: number }>();
  for (const a of analyses) {
    const fam = a.opening?.family ?? "Unknown opening";
    const gr = groups.get(fam) ?? { games: 0, w: 0, l: 0, errors: 0, book: 0, leftByYou: 0 };
    gr.games++;
    if (a.game.result === "win") gr.w++;
    if (a.game.result === "loss") gr.l++;
    gr.errors += keyMoments(a).length;
    gr.book += a.opening?.bookPlies ?? 0;
    if (a.opening?.leftBy === a.game.userColor) gr.leftByYou++;
    groups.set(fam, gr);
  }
  const rows = [...groups.entries()].sort((a, b) => b[1].games - a[1].games).slice(0, 5);
  return (
    <Card className="md:col-span-2 xl:col-span-4">
      <CardHeader>
        <CardTitle>Openings</CardTitle>
        <CardDescription>Named from Lichess's opening list. "Book" is how many moves stayed in known theory.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-6 gap-y-2 text-sm">
          <span className="text-muted-foreground text-xs">Opening</span>
          <span className="text-muted-foreground text-right text-xs">W–L</span>
          <span className="text-muted-foreground text-right text-xs">Your errors</span>
          <span className="text-muted-foreground text-right text-xs">Avg book · you left first</span>
          {rows.map(([fam, r]) => (
            <div key={fam} className="contents">
              <span className="truncate">{fam} <span className="text-muted-foreground">×{r.games}</span></span>
              <span className="text-right tabular-nums">{r.w}–{r.l}</span>
              <span className="text-right tabular-nums">{r.errors}</span>
              <span className="text-muted-foreground text-right tabular-nums">
                {(r.book / r.games / 2).toFixed(1)} moves · {r.leftByYou}/{r.games}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function EndingsCard({ games }: { games: GameRecord[] }) {
  const rows = (["win", "loss", "draw"] as const)
    .map((result) => {
      const counts = new Map<EndReason, number>();
      for (const g of games) if (g.result === result) counts.set(g.endReason, (counts.get(g.endReason) ?? 0) + 1);
      return { result, entries: [...counts.entries()].sort((a, b) => b[1] - a[1]) };
    })
    .filter((r) => r.entries.length);
  const label = { win: "Won", loss: "Lost", draw: "Drawn" } as const;
  const tint = { win: "text-win", loss: "text-loss", draw: "text-muted-foreground" } as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle>How games ended</CardTitle>
        <CardDescription>Checkmate, clock, or resignation</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rows.map(({ result, entries }) => (
          <div key={result} className="flex flex-col gap-1.5">
            <span className={cn("text-xs font-semibold", tint[result])}>{label[result]}</span>
            <div className="flex flex-wrap gap-1.5">
              {entries.map(([reason, n]) => {
                const Icon = END_REASON_ICON[reason];
                return (
                  <Badge key={reason} variant="secondary">
                    <Icon /> {END_REASON_LABEL[reason]} <span className="text-muted-foreground">×{n}</span>
                  </Badge>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
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
            <ResultBadge result={g.result} reason={g.endReason} />
            <span className="truncate font-medium">
              vs {opp.name}
              {opp.rating && <span className="text-muted-foreground font-normal"> ({opp.rating})</span>}
            </span>
            <span className="text-muted-foreground ml-auto shrink-0 text-xs capitalize">
              {sideName(g.userColor)} · {g.timeClass} · {time}
            </span>
          </div>
          {(a?.opening?.name ?? g.opening) && (
            <p className="text-muted-foreground truncate text-xs">
              {a?.opening ? `${a.opening.eco} · ${a.opening.name}` : g.opening}
            </p>
          )}
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
