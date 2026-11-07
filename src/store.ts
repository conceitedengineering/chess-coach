// The three things worth keeping across devices, all stored as { [key]: item } maps in localStorage.
// Every write announces itself so open screens can reload and the sync can push.

export type StoreName = "bank" | "notes" | "days";
export type ChangeSource = "local" | "sync";
export type StoreData = Record<string, Record<string, unknown>>;

export const STORE_KEYS: Record<StoreName, string> = {
  bank: "chess-coach:bank:v1",
  notes: "chess-coach:notes:v1",
  days: "chess-coach:days:v1",
};
export const STORE_NAMES = Object.keys(STORE_KEYS) as StoreName[];

const EVENT = "chess-coach:data";

export function readStore<T = Record<string, unknown>>(name: StoreName): Record<string, T> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEYS[name]) ?? "{}");
  } catch {
    return {};
  }
}

export function writeStore(name: StoreName, data: Record<string, unknown>, source: ChangeSource = "local") {
  try {
    localStorage.setItem(STORE_KEYS[name], JSON.stringify(data));
  } catch {
    /* storage full or blocked */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { name, source } }));
}

export function onStoreChange(cb: (name: StoreName, source: ChangeSource) => void) {
  const handler = (e: Event) => {
    const { name, source } = (e as CustomEvent).detail;
    cb(name, source);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/** When an item last changed: the field differs per store. */
export function itemTime(name: StoreName, item: unknown): number {
  const it = item as Record<string, number | undefined>;
  if (name === "days") return it.savedAt ?? 0;
  return it.updatedAt ?? it.lastReviewed ?? it.addedAt ?? 0;
}

/** Per-item last-write-wins merge. Returns the merged map and whether it differs from each side. */
export function mergeMaps(name: StoreName, local: Record<string, unknown>, remote: Record<string, unknown>) {
  const merged: Record<string, unknown> = { ...local };
  let changedLocal = false;
  for (const [k, r] of Object.entries(remote)) {
    const l = local[k];
    if (l === undefined || itemTime(name, r) > itemTime(name, l)) {
      merged[k] = r;
      changedLocal = true;
    }
  }
  let changedRemote = false;
  for (const [k, m] of Object.entries(merged)) {
    const r = remote[k];
    if (r === undefined || itemTime(name, m) > itemTime(name, r)) {
      changedRemote = true;
      break;
    }
  }
  return { merged, changedLocal, changedRemote };
}
