import { useRef, useState } from "react";
import { AlertCircle, Cloud, CloudOff, Download, ExternalLink, Loader2, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DEFAULT_REPO, importBackup, type useSync } from "@/sync";
import { cn } from "@/lib/utils";

type Sync = ReturnType<typeof useSync>;

const ago = (t?: number) => {
  if (!t) return "never";
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
};

const tokenUrl = (repo: string) => {
  const owner = repo.split("/")[0] || "conceitedengineering";
  const p = new URLSearchParams({
    name: "Chess Coach sync",
    description: `Lets the Chess Coach site read and write ${repo}`,
    target_name: owner,
    expires_in: "366",
    contents: "write",
  });
  return `https://github.com/settings/personal-access-tokens/new?${p}`;
};

export function SyncDialog({ sync }: { sync: Sync }) {
  const [repo, setRepo] = useState(sync.config?.repo ?? DEFAULT_REPO);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const stale = !sync.config && (!sync.meta.lastExport || Date.now() - sync.meta.lastExport > 7 * 86_400_000);
  const Icon = sync.state === "syncing" ? Loader2 : sync.state === "error" ? AlertCircle : sync.config ? Cloud : CloudOff;
  const label =
    sync.state === "syncing" ? "Syncing…"
    : sync.state === "error" ? "Sync problem"
    : sync.config ? `Synced ${ago(sync.meta.lastSync)}`
    : "Backup & sync";

  const connect = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await sync.connect({ repo: repo.trim(), token: token.trim() });
      setToken("");
      setMsg({ ok: true, text: "Connected. Your data is syncing now." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      const n = await importBackup(f);
      setMsg({ ok: true, text: n ? `Imported: ${n} ${n === 1 ? "item" : "items"} added or updated.` : "Nothing new in that file." });
      sync.syncNow();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message || "Couldn't read that file." });
    }
  };

  return (
    <Dialog onOpenChange={() => setMsg(null)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={label} className="relative">
              <Icon className={cn(sync.state === "syncing" && "animate-spin", sync.state === "error" && "text-destructive")} />
              {stale && <span className="bg-mistake absolute top-1.5 right-1.5 size-1.5 rounded-full" />}
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>{stale ? "No recent backup" : label}</TooltipContent>
      </Tooltip>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Backup & sync</DialogTitle>
          <DialogDescription>
            Your mistake bank, notes and daily summaries. Engine results are recomputed, so they stay on each device.
          </DialogDescription>
        </DialogHeader>

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold">Sync with GitHub</h3>
            {sync.config && (
              <span className="text-muted-foreground text-xs">{sync.state === "syncing" ? "Syncing…" : `Last synced ${ago(sync.meta.lastSync)}`}</span>
            )}
          </div>

          {sync.config ? (
            <>
              <p className="text-muted-foreground text-sm">
                Connected to <span className="text-foreground font-medium">{sync.config.repo}</span>. Changes sync about 10
                seconds after you make them, and when you come back to the tab.
              </p>
              {sync.error && <p className="text-destructive text-sm">{sync.error}</p>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => sync.syncNow()} disabled={sync.state === "syncing"}>
                  <RefreshCw className={cn(sync.state === "syncing" && "animate-spin")} /> Sync now
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={`https://github.com/${sync.config.repo}/commits`} target="_blank" rel="noopener noreferrer">
                    History <ExternalLink />
                  </a>
                </Button>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={sync.disconnect}>
                  Disconnect this browser
                </Button>
              </div>
            </>
          ) : (
            <>
              <ol className="text-muted-foreground flex list-decimal flex-col gap-1.5 pl-5 text-sm">
                <li>
                  <a href={tokenUrl(repo)} target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-2">
                    Create a GitHub token
                  </a>{" "}
                  (opens GitHub with the settings filled in). Under <em>Repository access</em> choose{" "}
                  <em>Only select repositories</em> → <span className="text-foreground">{repo.split("/")[1] || "your data repo"}</span>.
                  Check that <em>Contents</em> says <em>Read and write</em>, then generate it.
                </li>
                <li>Paste it below and connect. It's kept only in this browser and only works on that one repo.</li>
              </ol>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <div className="grid gap-1.5">
                  <Label htmlFor="sync-repo" className="text-muted-foreground text-xs">Private repo</Label>
                  <Input id="sync-repo" value={repo} onChange={(e) => setRepo(e.target.value)} spellCheck={false} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="sync-token" className="text-muted-foreground text-xs">Token</Label>
                  <Input
                    id="sync-token"
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="github_pat_…"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <Button onClick={connect} disabled={busy || !token.trim() || !repo.includes("/")}>
                  {busy && <Loader2 className="animate-spin" />} Connect
                </Button>
              </div>
            </>
          )}
        </section>

        <Separator />

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold">Backup file</h3>
            <span className={cn("text-xs", stale ? "text-mistake" : "text-muted-foreground")}>
              Last backup {ago(sync.meta.lastExport)}
            </span>
          </div>
          <p className="text-muted-foreground text-sm">
            Download everything as one file, or load one back in. Loading merges: newer items win and nothing is deleted.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={sync.exportBackup}>
              <Download /> Download backup
            </Button>
            <Button size="sm" variant="outline" onClick={() => file.current?.click()}>
              <Upload /> Load backup…
            </Button>
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                onImport(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </section>

        {msg && <p className={cn("text-sm", msg.ok ? "text-best" : "text-destructive")}>{msg.text}</p>}
      </DialogContent>
    </Dialog>
  );
}
