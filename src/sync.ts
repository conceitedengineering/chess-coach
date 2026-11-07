// Backup file export/import, and local-first sync to a private GitHub repo through the REST API.
// Each store is one JSON file (data/bank.json, data/notes.json, data/days.json); items merge by their
// own timestamps, so two devices can both make changes and nothing is lost.
import { useCallback, useEffect, useRef, useState } from "react";
import { mergeMaps, onStoreChange, readStore, STORE_NAMES, writeStore, type StoreName } from "@/store";

export interface SyncConfig {
  repo: string; // "owner/name"
  token: string; // fine-grained PAT, Contents read/write on that one repo
}

interface SyncMeta {
  lastSync?: number;
  lastExport?: number;
}

const CONFIG_KEY = "chess-coach:sync:v1";
const META_KEY = "chess-coach:sync-meta:v1";
export const DEFAULT_REPO = "conceitedengineering/chess-coach-data";
const PUSH_DEBOUNCE_MS = 10_000;
const API = "https://api.github.com";

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch { /* ignore */ }
};
const readMeta = () => readJson<SyncMeta>(META_KEY, {});
const patchMeta = (p: SyncMeta) => writeJson(META_KEY, { ...readMeta(), ...p });

/** One item per line: compact, but git diffs stay readable. */
function stringifyMap(data: Record<string, unknown>) {
  const keys = Object.keys(data).sort();
  if (!keys.length) return "{}\n";
  return `{\n${keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(data[k])}`).join(",\n")}\n}\n`;
}

// ---------- backup file ----------

export function exportBackup() {
  const payload = {
    app: "chess-coach",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    ...Object.fromEntries(STORE_NAMES.map((n) => [n, readStore(n)])),
  };
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chess-coach-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  patchMeta({ lastExport: Date.now() });
}

/** Merges a backup into this browser; newer items win, nothing is deleted. Returns how many items changed. */
export async function importBackup(file: File): Promise<number> {
  const data = JSON.parse(await file.text());
  if (data?.app !== "chess-coach") throw new Error("That file isn't a Chess Coach backup.");
  let changed = 0;
  for (const name of STORE_NAMES) {
    const incoming = data[name];
    if (!incoming || typeof incoming !== "object") continue;
    const local = readStore(name);
    const { merged, changedLocal } = mergeMaps(name, local, incoming);
    if (changedLocal) {
      changed += Object.keys(merged).filter((k) => merged[k] !== local[k]).length;
      writeStore(name, merged, "sync"); // "sync" so open screens reload
    }
  }
  return changed;
}

// ---------- GitHub ----------

function toBase64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromBase64(b64: string) {
  return new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, "")), (c) => c.charCodeAt(0)));
}

export class SyncError extends Error {}

async function gh(cfg: SyncConfig, path: string, init: RequestInit = {}, accept = "application/vnd.github+json") {
  const res = await fetch(`${API}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: accept,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (res.status === 401) throw new SyncError("GitHub rejected the token (expired or mistyped).");
  return res;
}

/** Checks the token can read and write the repo, and that the repo is private. */
export async function checkRepo(cfg: SyncConfig) {
  const res = await gh(cfg, `/repos/${cfg.repo}`);
  if (res.status === 404) throw new SyncError(`Can't see ${cfg.repo}. Check the name, and that the token includes this repo.`);
  if (!res.ok) throw new SyncError(`GitHub returned HTTP ${res.status}.`);
  const repo = await res.json();
  if (!repo.private) throw new SyncError(`${cfg.repo} is public. Use a private repo so your notes stay private.`);
  if (repo.permissions && !repo.permissions.push) {
    throw new SyncError("The token can read but not write. Give it Contents: Read and write.");
  }
}

async function getFile(cfg: SyncConfig, name: StoreName): Promise<{ data: Record<string, unknown>; sha: string } | null> {
  const path = `/repos/${cfg.repo}/contents/data/${name}.json`;
  const res = await gh(cfg, path);
  if (res.status === 404) return null;
  if (!res.ok) throw new SyncError(`Reading ${name}.json failed (HTTP ${res.status}).`);
  const meta = await res.json();
  let text: string;
  if (meta.content && meta.encoding === "base64") {
    text = fromBase64(meta.content);
  } else {
    // Files over 1 MB come back without inline content; fetch them raw.
    const raw = await gh(cfg, path, {}, "application/vnd.github.raw");
    if (!raw.ok) throw new SyncError(`Reading ${name}.json failed (HTTP ${raw.status}).`);
    text = await raw.text();
  }
  return { data: JSON.parse(text || "{}"), sha: meta.sha };
}

async function putFile(cfg: SyncConfig, name: StoreName, data: Record<string, unknown>, sha?: string) {
  const res = await gh(cfg, `/repos/${cfg.repo}/contents/data/${name}.json`, {
    method: "PUT",
    body: JSON.stringify({
      message: `Sync ${name} (${Object.keys(data).length} items)`,
      content: toBase64(stringifyMap(data)),
      ...(sha ? { sha } : {}),
    }),
  });
  if (res.status === 409 || res.status === 422) return false; // someone else wrote first
  if (!res.ok) throw new SyncError(`Saving ${name}.json failed (HTTP ${res.status}).`);
  return true;
}

/** Pull, merge, save locally, push if GitHub is behind. Retries a store once if another device wrote meanwhile. */
async function syncStore(cfg: SyncConfig, name: StoreName) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const remote = await getFile(cfg, name);
    const local = readStore(name);
    const { merged, changedLocal, changedRemote } = mergeMaps(name, local, remote?.data ?? {});
    if (changedLocal) writeStore(name, merged, "sync");
    if (!changedRemote && remote) return;
    if (await putFile(cfg, name, merged, remote?.sha)) return;
  }
  throw new SyncError(`Couldn't save ${name}.json: it kept changing on GitHub. Try again in a moment.`);
}

export async function syncAll(cfg: SyncConfig) {
  for (const name of STORE_NAMES) await syncStore(cfg, name);
  patchMeta({ lastSync: Date.now() });
}

// ---------- React hook ----------

export type SyncState = "off" | "idle" | "syncing" | "error";

export function useSync() {
  const [config, setConfig] = useState<SyncConfig | null>(() => readJson<SyncConfig | null>(CONFIG_KEY, null));
  const [state, setState] = useState<SyncState>(config ? "idle" : "off");
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<SyncMeta>(readMeta);
  const running = useRef(false);
  const again = useRef(false);
  const timer = useRef(0);
  const cfgRef = useRef(config);
  cfgRef.current = config;

  const syncNow = useCallback(async () => {
    const cfg = cfgRef.current;
    if (!cfg) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    setState("syncing");
    try {
      do {
        again.current = false;
        await syncAll(cfg);
      } while (again.current);
      setError(null);
      setState("idle");
    } catch (e) {
      setError(e instanceof SyncError ? e.message : "Sync failed (network?). It will retry.");
      setState("error");
    } finally {
      running.current = false;
      setMeta(readMeta());
    }
  }, []);

  // Sync on open, when the tab comes back, and ~10s after any local change.
  useEffect(() => {
    if (!config) return;
    syncNow();
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - (readMeta().lastSync ?? 0) > 30_000) syncNow();
    };
    document.addEventListener("visibilitychange", onVisible);
    const off = onStoreChange((_name, source) => {
      if (source !== "local") return;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(syncNow, PUSH_DEBOUNCE_MS);
    });
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      off();
      window.clearTimeout(timer.current);
    };
  }, [config, syncNow]);

  const connect = useCallback(async (cfg: SyncConfig) => {
    await checkRepo(cfg); // throws a readable SyncError
    writeJson(CONFIG_KEY, cfg);
    setConfig(cfg);
    setState("idle");
  }, []);

  const disconnect = useCallback(() => {
    localStorage.removeItem(CONFIG_KEY);
    setConfig(null);
    setState("off");
    setError(null);
  }, []);

  const doExport = useCallback(() => {
    exportBackup();
    setMeta(readMeta());
  }, []);

  return { config, state, error, meta, syncNow, connect, disconnect, exportBackup: doExport };
}
