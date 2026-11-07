import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Drill } from "@/components/Drill";
import { GameReview } from "@/components/GameReview";
import { LoadForm } from "@/components/LoadForm";
import { allMoments, Summary } from "@/components/Summary";
import { keyMoments } from "@/analysis";
import { recentTagCounts, toBankItem, useBank, type BankItem } from "@/bank";
import { summarizeDay, useDays } from "@/days";
import { ThemeToggle } from "@/theme";
import { SyncDialog } from "@/components/SyncDialog";
import { useSync } from "@/sync";
import { useCoach } from "@/useCoach";

type View =
  | { kind: "summary" }
  | { kind: "game"; index: number; pos: number }
  | { kind: "drill"; title: string; items: BankItem[]; index: number };

export function App() {
  const { slots, status, run, evaluate, date, depth } = useCoach();
  const [view, setView] = useState<View>({ kind: "summary" });
  const busy = status.kind === "fetching" || status.kind === "analyzing";
  const bank = useBank();

  const days = useDays();
  const sync = useSync();

  // When a whole day is analyzed, save its summary for the trend charts.
  useEffect(() => {
    if (status.kind !== "done" || !date || !slots.length || slots.some((s) => !s.analysis)) return;
    days.save(summarizeDay(date, depth, slots.map((s) => s.analysis!)));
  }, [status.kind, date, depth, slots, days.save]);

  // Every analyzed game feeds its mistakes into the bank (once per game).
  const banked = useRef(new Set<string>());
  useEffect(() => {
    for (const s of slots) {
      if (s.analysis && !banked.current.has(s.game.id)) {
        banked.current.add(s.game.id);
        bank.addGame(s.analysis);
      }
    }
  }, [slots, bank.addGame]);

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
  const startDayDrill = () =>
    goto({ kind: "drill", title: "Drill", index: 0, items: allMoments(slots).map(({ a, m }) => toBankItem(a, m)) });
  const startReview = () => goto({ kind: "drill", title: "Review", index: 0, items: bank.due });
  const openBankGame = (it: BankItem) => {
    const index = slots.findIndex((s) => s.game.id === it.gameId && s.analysis);
    if (index >= 0) goto({ kind: "game", index, pos: it.ply + 1 });
    else window.open(it.gameUrl, "_blank", "noopener,noreferrer");
  };
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
          <div className="ml-auto flex items-center gap-1">
            <SyncDialog sync={sync} />
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

        {view.kind === "drill" && view.items.length ? (
          <Drill
            items={view.items}
            title={view.title}
            index={Math.min(view.index, view.items.length - 1)}
            onIndex={(index) => setView({ ...view, index })}
            onBack={() => goto({ kind: "summary" })}
            onOpenGame={openBankGame}
            onResult={bank.record}
            scheduleOf={(key) => bank.items[key]}
            evaluate={evaluate}
          />
        ) : slots.length === 0 && status.kind !== "fetching" ? (
          <EmptyState loading={status.kind === "idle"} />
        ) : view.kind === "game" && game ? (
          <GameReview a={game} pos={view.pos} onSeek={seek} onBack={() => goto({ kind: "summary" })} />
        ) : (
          <Summary
            slots={slots}
            onOpenGame={openGame}
            onDrill={startDayDrill}
            bank={{ size: bank.list.length, due: bank.due.length, recentTags: recentTagCounts(bank.list) }}
            onReview={startReview}
            trendDays={days.list}
          />
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
