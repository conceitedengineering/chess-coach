import {
  CircleHelp, CircleSlash, Crown, Flag, Handshake, Hash, Repeat, Scale, Timer, UserX, type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MoveInfo } from "@/analysis";
import { END_REASON_LABEL, type Color, type EndReason, type GameRecord, type Platform } from "@/games";

export const pct = (n: number) => `${Math.round(n)}%`;
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : w.endsWith("s") ? "es" : "s"}`;
export const sideName = (c: Color) => (c === "w" ? "White" : "Black");
export const platformName = (p: Platform) => (p === "lichess" ? "Lichess" : "Chess.com");
export const opponent = (g: GameRecord) => (g.userColor === "w" ? g.black : g.white);

export const isError = (m: MoveInfo) =>
  m.isMiss || m.classification === "blunder" || m.classification === "mistake" || m.classification === "inaccuracy";

export type Severity = "best" | "good" | "inaccuracy" | "mistake" | "blunder" | "miss";
export const severity = (m: Pick<MoveInfo, "isMiss" | "classification">): Severity => (m.isMiss ? "miss" : m.classification);

const LABEL: Record<MoveInfo["classification"], string> = {
  best: "Best",
  good: "Good",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
};

/** Tailwind classes per severity: tinted background + colored text, legible in both themes. */
export const SEVERITY_TINT: Record<Severity, string> = {
  best: "bg-best/15 text-best",
  good: "bg-best/15 text-best",
  inaccuracy: "bg-inaccuracy/15 text-inaccuracy",
  mistake: "bg-mistake/15 text-mistake",
  blunder: "bg-blunder/15 text-blunder",
  miss: "bg-miss/15 text-miss",
};

export const SEVERITY_TEXT: Record<Severity, string> = {
  best: "text-best",
  good: "text-best",
  inaccuracy: "text-inaccuracy",
  mistake: "text-mistake",
  blunder: "text-blunder",
  miss: "text-miss",
};

export function MoveBadge({ m, className }: { m: Pick<MoveInfo, "isMiss" | "classification">; className?: string }) {
  const label = m.isMiss ? `Miss · ${LABEL[m.classification]}` : LABEL[m.classification];
  return <Badge className={cn(SEVERITY_TINT[severity(m)], "font-semibold", className)}>{label}</Badge>;
}

export const END_REASON_ICON: Record<EndReason, LucideIcon> = {
  checkmate: Crown,
  resignation: Flag,
  time: Timer,
  abandoned: UserX,
  agreement: Handshake,
  repetition: Repeat,
  stalemate: CircleSlash,
  insufficient: Scale,
  fiftyMove: Hash,
  other: CircleHelp,
};

const RESULT_STYLE = {
  win: ["Won", "bg-win/15 text-win"],
  loss: ["Lost", "bg-loss/15 text-loss"],
  draw: ["Draw", "bg-muted text-muted-foreground"],
} as const;

export function ResultBadge({ result, reason }: { result: GameRecord["result"]; reason?: EndReason }) {
  const [label, cls] = RESULT_STYLE[result];
  const Icon = reason ? END_REASON_ICON[reason] : null;
  return (
    <Badge className={cn(cls, "font-semibold")}>
      {Icon && <Icon />}
      {label}
      {reason && <span className="font-normal opacity-80">· {END_REASON_LABEL[reason]}</span>}
    </Badge>
  );
}

export function SanText({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-mono text-[0.92em] font-medium tracking-tight", className)}>{children}</span>;
}
