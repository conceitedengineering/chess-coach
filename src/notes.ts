// "What was I thinking?" notes, one per position, kept in this browser (and synced, if set up).
import { useEffect, useRef, useState } from "react";
import { onStoreChange, readStore, writeStore } from "@/store";

export interface Note {
  text: string;
  updatedAt: number;
  deleted?: boolean; // kept as a marker so a deletion also reaches other devices
}

export const loadNotes = () => readStore<Note>("notes");
const noteText = (posKey: string) => {
  const n = loadNotes()[posKey];
  return n && !n.deleted ? n.text : "";
};

function saveNote(posKey: string, text: string) {
  const all = loadNotes();
  const old = all[posKey];
  if ((old && !old.deleted ? old.text : "") === text) return; // nothing changed
  all[posKey] = text.trim() ? { text, updatedAt: Date.now() } : { text: "", updatedAt: Date.now(), deleted: true };
  writeStore("notes", all);
}

/** The note for a position, saved half a second after you stop typing. */
export function useNote(posKey: string) {
  const [text, setText] = useState(() => noteText(posKey));
  const timer = useRef(0);
  const latest = useRef(text);

  // Switching positions: flush the old note, load the new one.
  useEffect(() => {
    const loaded = noteText(posKey);
    latest.current = loaded;
    setText(loaded);
    return () => {
      window.clearTimeout(timer.current);
      saveNote(posKey, latest.current);
    };
  }, [posKey]);

  // A synced change from another device: show it unless you're mid-typing.
  useEffect(() => onStoreChange((name, source) => {
    if (name !== "notes" || source !== "sync" || timer.current) return;
    const t = noteText(posKey);
    latest.current = t;
    setText(t);
  }), [posKey]);

  const update = (t: string) => {
    latest.current = t;
    setText(t);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = 0;
      saveNote(posKey, t);
    }, 500);
  };
  return [text, update] as const;
}
