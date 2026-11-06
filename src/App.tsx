import { useCallback, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Drill } from "@/components/Drill";
import { GameReview } from "@/components/GameReview";
import { LoadForm } from "@/components/LoadForm";
import { allMoments, Summary } from "@/components/Summary";
import { keyMoments } from "@/analysis";
import { ThemeToggle } from "@/theme";
import { useCoach } from "@/useCoach";

type View =
  | { kind: "summary" }
  | { kind: "game"; index: number; pos: number }
  | { kind: "drill"; index: number };

export function App() {
  const { slots, status, run, evaluate } = useCoach();
  const [view, setView] = useState<View>({ kind: "summary" });
  const busy = status.kind === "fetching" || status.kind === "analyzing";

  const goto = (v: View) => {
    setView(v);
    window.scrollTo({ top: 0 });
  };

  const openGame = (index: number) => {
    const a = slots[index].analysis;
    const first = a ? keyMoments(a)[0] : undefined;
    goto({ kind: "game", index, pos: first ? first.ply + 1 : 0 });
  };

  const seek = useCallback((pos: number) => setView((v) => (v.kind === "game" ? { ...v, pos } : v)), []);
  const moments = allMoments(slots);
  const game = view.kind === "game" ? slots[view.index]?.analysis : undefined;

  return (
    <div className="min-h-svh">
      <header className="bg-background/80 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <div className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg text-lg leading-none">
            ♞&#xFE0E;
          </div>
          <span className="font-semibold tracking-tight">Chess Coach</span>
          <Badge variant="outline" className="text-muted-foreground hidden sm:inline-flex">
            Stockfish 19 · runs in your browser
          </Badge>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
        <LoadForm
          busy={busy}
          onSubmit={(p) => {
            setView({ kind: "summary" });
            run(p);
          }}
        />

        {status.kind === "fetching" && <p className="text-muted-foreground text-sm">{status.message}</p>}
        {status.kind === "analyzing" && (
          <div className="flex flex-col gap-2">
            <div className="text-muted-foreground flex justify-between text-sm">
              <span>Analyzing</span>
              <span className="tabular-nums">{status.message}</span>
            </div>
            <Progress value={status.progress * 100} />
          </div>
        )}
        {status.kind === "error" && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{status.message}</AlertDescription>
          </Alert>
        )}

        {slots.length === 0 && status.kind !== "fetching" ? (
          <EmptyState loading={status.kind === "idle"} />
        ) : view.kind === "game" && game ? (
          <GameReview a={game} pos={view.pos} onSeek={seek} onBack={() => goto({ kind: "summary" })} />
        ) : view.kind === "drill" && moments.length ? (
          <Drill
            moments={moments}
            index={Math.min(view.index, moments.length - 1)}
            onIndex={(index) => setView({ kind: "drill", index })}
            onBack={() => goto({ kind: "summary" })}
            onOpenGame={(a, m) => goto({ kind: "game", index: slots.findIndex((s) => s.analysis === a), pos: m.ply + 1 })}
            evaluate={evaluate}
          />
        ) : (
          <Summary slots={slots} onOpenGame={openGame} onDrill={() => goto({ kind: "drill", index: 0 })} />
        )}
      </main>
    </div>
  );
}

function EmptyState({ loading }: { loading: boolean }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 py-16 text-center">
      <div className="bg-muted text-muted-foreground grid size-14 place-items-center rounded-2xl text-3xl leading-none">
        ♟&#xFE0E;
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{loading ? "Finding your latest games…" : "Pick a day"}</h1>
      <p className="text-muted-foreground text-balance">
        {loading
          ? "Stockfish will check every move in your browser and show your blunders, missed chances, and a drill to practice them."
          : "Choose one of your recent days above, or any date, and hit Analyze."}
      </p>
    </div>
  );
}
