import { winPct, type GameAnalysis } from "@/analysis";
import { severity } from "@/lib/chess-ui";

const STROKE: Record<string, string> = {
  blunder: "stroke-blunder",
  mistake: "stroke-mistake",
  miss: "stroke-miss",
};

/** The user's winning chances across the game. Click anywhere to jump to that position. */
export function EvalChart({ a, pos, onSeek }: { a: GameAnalysis; pos: number; onSeek: (pos: number) => void }) {
  const n = Math.max(1, a.evals.length - 1);
  const W = 1000;
  const H = 100;
  const mine = (wp: number) => (a.game.userColor === "w" ? wp : 100 - wp);
  const pts = a.evals.map((e, i) => `${((i / n) * W).toFixed(1)},${(H - mine(winPct(e))).toFixed(1)}`);
  const marks = a.moves.filter(
    (m) => m.color === a.game.userColor && (m.isMiss || m.classification === "blunder" || m.classification === "mistake"),
  );
  const x = (p: number) => (p / n) * W;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="bg-muted/50 h-28 w-full cursor-crosshair rounded-lg"
      role="img"
      aria-label="Your winning chances over the game"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onSeek(Math.round(((e.clientX - r.left) / r.width) * n));
      }}
    >
      <polygon points={`0,${H} ${pts.join(" ")} ${W},${H}`} className="fill-foreground/12" />
      <polyline points={pts.join(" ")} className="stroke-foreground/70 fill-none" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <line x1={0} x2={W} y1={50} y2={50} className="stroke-muted-foreground/50" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      {marks.map((m) => (
        <line
          key={m.ply}
          x1={x(m.ply + 1)}
          x2={x(m.ply + 1)}
          y1={0}
          y2={H}
          className={STROKE[severity(m)] ?? "stroke-mistake"}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <line x1={x(pos)} x2={x(pos)} y1={0} y2={H} className="stroke-foreground" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const TIME_FILL: Record<string, string> = {
  blunder: "fill-blunder",
  mistake: "fill-mistake",
  miss: "fill-miss",
};

export const formatSeconds = (s: number) =>
  s < 60 ? `${s < 10 ? s.toFixed(1) : Math.round(s)}s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Bars for how long you spent on each of your moves, aligned with the chart above. */
export function TimeStrip({ a, pos, onSeek }: { a: GameAnalysis; pos: number; onSeek: (pos: number) => void }) {
  const mine = a.moves.filter((m) => m.color === a.game.userColor && m.timeSpent !== undefined);
  if (!mine.length) return null;
  const n = Math.max(1, a.evals.length - 1);
  const W = 1000;
  const H = 40;
  const max = Math.max(...mine.map((m) => m.timeSpent!), 1);
  const barW = Math.max(3, (W / n) * 1.6);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="bg-muted/50 h-10 w-full cursor-crosshair rounded-lg"
      role="img"
      aria-label="Time you spent on each move"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onSeek(Math.round(((e.clientX - r.left) / r.width) * n));
      }}
    >
      {mine.map((m) => {
        const h = Math.max(1.5, Math.sqrt(m.timeSpent! / max) * (H - 4));
        const x = ((m.ply + 1) / n) * W - barW / 2;
        const err = m.isMiss || m.classification === "blunder" || m.classification === "mistake";
        const sev = m.isMiss ? "miss" : m.classification;
        return (
          <rect key={m.ply} x={x} y={H - h} width={barW} height={h} rx={1}
            className={err ? TIME_FILL[sev] : "fill-foreground/30"}>
            <title>{`${m.moveLabel} ${m.san}: ${formatSeconds(m.timeSpent!)}`}</title>
          </rect>
        );
      })}
      <line x1={(pos / n) * W} x2={(pos / n) * W} y1={0} y2={H} className="stroke-foreground" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
