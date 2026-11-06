import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PLAYER } from "@/config";
import { fetchRecentChessComDays, localDateKey } from "@/games";
import type { RunParams } from "@/useCoach";
import { cn } from "@/lib/utils";

const DEPTH_KEY = "chess-coach:depth";

function readDepth() {
  try {
    return localStorage.getItem(DEPTH_KEY) ?? "13";
  } catch {
    return "13";
  }
}

function dayLabel(date: string) {
  const today = localDateKey(Date.now());
  const yesterday = localDateKey(Date.now() - 86_400_000);
  if (date === today) return "Today";
  if (date === yesterday) return "Yesterday";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export function LoadForm({ busy, onSubmit }: { busy: boolean; onSubmit: (p: RunParams) => void }) {
  const [date, setDate] = useState(localDateKey(Date.now()));
  const [depth, setDepth] = useState(readDepth);
  const [days, setDays] = useState<{ date: string; count: number }[] | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const started = useRef(false);

  const analyze = (d: string, dep = depth) => {
    setDate(d);
    try {
      localStorage.setItem(DEPTH_KEY, dep);
    } catch { /* ignore */ }
    onSubmit({ platform: PLAYER.platform, username: PLAYER.username, date: d, depth: Number(dep) });
  };

  // On open: find the days you played recently and analyze the most recent one.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetch(`https://api.chess.com/pub/player/${PLAYER.username.toLowerCase()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => p?.avatar && setAvatar(p.avatar))
      .catch(() => {});
    fetchRecentChessComDays(PLAYER.username)
      .then((list) => {
        setDays(list);
        analyze(list[0]?.date ?? localDateKey(Date.now()));
      })
      .catch(() => {
        setDays([]);
        analyze(localDateKey(Date.now()));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={PLAYER.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:bg-muted -m-1.5 flex items-center gap-3 rounded-lg p-1.5 transition-colors"
          >
            {avatar ? (
              <img src={avatar} alt="" className="size-10 rounded-lg object-cover" />
            ) : (
              <div className="bg-muted size-10 rounded-lg" />
            )}
            <div className="leading-tight">
              <div className="flex items-center gap-1.5 font-semibold">
                {PLAYER.username} <ExternalLink className="text-muted-foreground size-3.5" />
              </div>
              <div className="text-muted-foreground text-xs">Chess.com</div>
            </div>
          </a>

          <form
            className="ml-auto flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              analyze(date);
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="date" className="text-muted-foreground text-xs">Day</Label>
              <Input
                id="date"
                type="date"
                value={date}
                max={localDateKey(Date.now())}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-40"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-muted-foreground text-xs">Depth</Label>
              <Select value={depth} onValueChange={setDepth}>
                <SelectTrigger className="w-36" aria-label="Engine depth">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 · quick</SelectItem>
                  <SelectItem value="13">13 · balanced</SelectItem>
                  <SelectItem value="16">16 · deeper</SelectItem>
                  <SelectItem value="19">19 · slow</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Play />}
              Analyze
            </Button>
          </form>
        </div>

        <div className="flex flex-col gap-2 border-t pt-4">
          <span className="text-muted-foreground text-xs font-medium">Recent days</span>
          <div className="flex flex-wrap gap-1.5">
            {days === null ? (
              Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-7 w-24 rounded-lg" />)
            ) : days.length === 0 ? (
              <span className="text-muted-foreground text-sm">No games in the last two months.</span>
            ) : (
              days.slice(0, 10).map((d) => (
                <Button
                  key={d.date}
                  size="sm"
                  variant={d.date === date ? "default" : "outline"}
                  disabled={busy && d.date !== date}
                  onClick={() => analyze(d.date)}
                  className={cn("tabular-nums")}
                >
                  {dayLabel(d.date)}
                  <span className={cn("text-xs", d.date === date ? "opacity-70" : "text-muted-foreground")}>
                    {d.count}
                  </span>
                </Button>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
