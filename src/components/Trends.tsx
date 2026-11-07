import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { errorsPerGame, type DaySummary } from "@/days";
import { cn } from "@/lib/utils";

interface Metric {
  title: string;
  hint: string;
  value: (d: DaySummary) => number;
  format: (v: number) => string;
}

const METRICS: Metric[] = [
  { title: "Errors per game", hint: "lower is better", value: errorsPerGame, format: (v) => v.toFixed(1) },
  { title: "Accuracy", hint: "higher is better", value: (d) => d.accuracy, format: (v) => `${Math.round(v)}%` },
  { title: "Games played", hint: "per day", value: (d) => d.games, format: (v) => String(Math.round(v)) },
];

const shortDate = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { month: "short", day: "numeric" });
};

/** One small line chart per metric, sharing the same days on the x axis. */
function MiniChart({ metric, days, hover, onHover }: {
  metric: Metric;
  days: DaySummary[];
  hover: number | null;
  onHover: (i: number | null) => void;
}) {
  const W = 300, H = 90, PAD_X = 8, PAD_TOP = 8, PAD_BOTTOM = 6;
  const vals = days.map(metric.value);
  // Scale to the data's own range (with a little headroom) so day-to-day changes are visible.
  const hi0 = Math.max(...vals);
  const lo0 = Math.min(...vals);
  const pad = (hi0 - lo0) * 0.2 || Math.max(1, hi0 * 0.1);
  const max = hi0 + pad;
  const min = Math.max(0, lo0 - pad);
  const x = (i: number) => PAD_X + (days.length === 1 ? (W - 2 * PAD_X) / 2 : (i / (days.length - 1)) * (W - 2 * PAD_X));
  const y = (v: number) => PAD_TOP + (1 - (v - min) / (max - min || 1)) * (H - PAD_TOP - PAD_BOTTOM);
  const path = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = vals.length - 1;
  const shown = hover ?? last;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{metric.title}</span>
        <span className="text-muted-foreground text-xs">{metric.hint}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{metric.format(vals[shown])}</span>
        <span className="text-muted-foreground text-xs">{hover === null ? "latest" : shortDate(days[shown].date)}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={`${metric.title} by day`}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          let best = 0;
          days.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
          onHover(best);
        }}
        onMouseLeave={() => onHover(null)}
      >
        <line x1={PAD_X} x2={W - PAD_X} y1={H - PAD_BOTTOM} y2={H - PAD_BOTTOM} className="stroke-border" strokeWidth={1} />
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD_TOP - 4} y2={H - PAD_BOTTOM} className="stroke-muted-foreground/60" strokeWidth={1} />
        )}
        {days.length > 1 && (
          <path d={path} className="stroke-foreground/80 fill-none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {vals.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={i === shown ? 4.5 : 3}
            className={cn("stroke-card", i === shown ? "fill-foreground" : "fill-foreground/60")} strokeWidth={2} />
        ))}
      </svg>
    </div>
  );
}

export function Trends({ days }: { days: DaySummary[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const recent = days.slice(-30);

  // Causes and openings across these days.
  const tagTotals = new Map<string, number>();
  const openingTotals = new Map<string, { games: number; errors: number }>();
  for (const d of recent) {
    for (const [t, n] of Object.entries(d.tags)) tagTotals.set(t, (tagTotals.get(t) ?? 0) + n);
    for (const [o, s] of Object.entries(d.openings ?? {})) {
      const cur = openingTotals.get(o) ?? { games: 0, errors: 0 };
      openingTotals.set(o, { games: cur.games + s.games, errors: cur.errors + s.errors });
    }
  }
  const topTags = [...tagTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const worstOpenings = [...openingTotals.entries()]
    .filter(([, s]) => s.games >= 2)
    .sort((a, b) => b[1].errors / b[1].games - a[1].errors / a[1].games)
    .slice(0, 3);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your trend</CardTitle>
        <CardDescription>
          {recent.length < 2
            ? "Trends appear once you've analyzed two or more days. Click a few of your recent days above."
            : `${recent.length} days analyzed, ${shortDate(recent[0].date)} – ${shortDate(recent[recent.length - 1].date)}. Hover a chart for any day.`}
        </CardDescription>
      </CardHeader>
      {recent.length >= 2 && (
        <CardContent className="flex flex-col gap-6">
          <div className="grid gap-6 md:grid-cols-3">
            {METRICS.map((m) => (
              <MiniChart key={m.title} metric={m} days={recent} hover={hover} onHover={setHover} />
            ))}
          </div>
          <div className="grid gap-4 text-sm md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs">Most common causes over these days</span>
              {topTags.length ? topTags.map(([t, n]) => (
                <div key={t} className="flex justify-between gap-2">
                  <span>{t}</span>
                  <span className="text-muted-foreground tabular-nums">{n}</span>
                </div>
              )) : <span className="text-muted-foreground">None yet</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs">Openings with the most errors per game (2+ games)</span>
              {worstOpenings.length ? worstOpenings.map(([o, s]) => (
                <div key={o} className="flex justify-between gap-2">
                  <span className="truncate">{o}</span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {(s.errors / s.games).toFixed(1)} per game · {s.games} games
                  </span>
                </div>
              )) : <span className="text-muted-foreground">Not enough games yet</span>}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
