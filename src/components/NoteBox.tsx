import { NotebookPen } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useNote } from "@/notes";

/** "What was I thinking?" — coaches' favorite question, saved per position. */
export function NoteBox({ posKey, prompt = "What were you thinking here?" }: { posKey: string; prompt?: string }) {
  const [text, setText] = useNote(posKey);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <NotebookPen className="size-3.5" /> {prompt}
      </span>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. I thought the bishop was defended / I was rushing / I didn't see the check"
        rows={2}
        className="min-h-14 resize-y text-sm"
      />
    </label>
  );
}
