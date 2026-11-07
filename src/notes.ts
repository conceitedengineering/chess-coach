// "What was I thinking?" notes, one per position, kept in this browser.
import { useEffect, useRef, useState } from "react";

const KEY = "chess-coach:notes:v1";

export interface Note {
  text: string;
  updatedAt: number;
}

export function loadNotes(): Record<string, Note> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveNote(posKey: string, text: string) {
  try {
    const all = loadNotes();
    if (text.trim()) all[posKey] = { text, updatedAt: Date.now() };
    else delete all[posKey];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage blocked: the note just won't persist */
  }
}

/** The note for a position, saved half a second after you stop typing. */
export function useNote(posKey: string) {
  const [text, setText] = useState(() => loadNotes()[posKey]?.text ?? "");
  const timer = useRef(0);
  const latest = useRef(text);

  // Switching positions: flush the old note, load the new one.
  useEffect(() => {
    const loaded = loadNotes()[posKey]?.text ?? "";
    latest.current = loaded;
    setText(loaded);
    return () => {
      window.clearTimeout(timer.current);
      saveNote(posKey, latest.current);
    };
  }, [posKey]);

  const update = (t: string) => {
    latest.current = t;
    setText(t);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => saveNote(posKey, t), 500);
  };
  return [text, update] as const;
}
