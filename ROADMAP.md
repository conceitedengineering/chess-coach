# Chess Coach roadmap

Ideas from a research sweep (Nov 2026) of chess apps, player forums, training books and open-source tools,
filtered for what fits this app: browser-only, one Chess.com player, data in localStorage.

**Guiding rule:** add one thing at a time and keep the screens familiar. New features should land inside
existing cards or behind one new button, not reshape the layout.

## Shipped

| When | Feature |
| --- | --- |
| Nov 2026 | Day analysis, game review, drill, line player, how games ended |
| Nov 2026 | **Mistake bank + spaced repetition**: every error saved; reviews after 1/3/7/21/60 days; a miss resets to tomorrow |
| Nov 2026 | **Recurring mistakes**: the same position erred in again resets its schedule and shows "Same mistake in N games"; Patterns shows the last 14 days |
| Nov 2026 | **Clock analysis**: time per move strip; "Moved too fast", "Time trouble", "Long think, then mistake" tags |
| Nov 2026 | **Cause tags**: "Left material hanging" vs "Ignored a threat" (null-move check), "Missed their check", "Missed free material" |
| Nov 2026 | **"What were you thinking?" notes** per position, in game review and the drill |
| Nov 2026 | **Opening names** (Lichess CC0 list), where you left known theory, Openings card, errors by opening over time |
| Nov 2026 | **Trends**: a saved summary per analyzed day; errors per game, accuracy and games played charted over the last 30 days |
| Nov 2026 | **Endgame verdicts** from the Lichess tablebase (≤7 pieces), e.g. "Endgame: winning → drawn" |
| Nov 2026 | **Backup & sync**: export/import backup file (merging), and local-first sync to a private GitHub repo (bank, notes, day summaries; per-item last-write-wins, conflict retry) |

## Next up

1. **Backfill**: analyze the last 7–30 days in the background so the bank and trends fill up even on days you
   don't open the app.

## Later (medium)

2. **Real tactic motifs** (fork, pin, skewer, discovered attack, back-rank, removing the defender) detected on the
   engine's best line → "Missed forks ×5" dashboard and drill-by-motif.
   Port rules from chess_detect (MIT, https://github.com/aslyamov/chess_detect) or reimplement lichess-puzzler's tagger
   ideas (AGPL, https://github.com/ornicar/lichess-puzzler/tree/master/tagger). ~400–600 lines TS.
3. **Blunder-check gate / "Find the threat" drill** (Heisman): after choosing a move, name the opponent's most
   dangerous reply; or, after their move, play the threat they just created.
4. **Convert winning positions** (Aimchess "Advantage Capitalization"): positions where you had ≥80% and didn't win,
   replayed against a weakened Stockfish (`Skill Level` / `UCI_LimitStrength`).
5. **Woodpecker / speed mode**: timed runs through the bank, each cycle at half the previous time. Only use
   "one clear best move" positions (MultiPV 2, best ≥ ~150cp ahead of second) so reasonable alternatives aren't punished.
6. **Lichess-style tolerance setting**: optionally accept any move within ~4% win chance of the best
   (lila `retroCtrl.ts`). Off by default, since we decided to require the best move.

## Someday (bigger)

7. **Maia, a human-like engine** (https://huggingface.co/bqrio/maia3-onnx, ~11MB fp16, onnxruntime-web):
    "what would an 800 / 1100 / 1500 player play here", "how normal is this blunder at your rating". ~1 day.
8. **Mixed sessions**: your mistakes plus fresh puzzles on your weakest theme, from a small bundled subset of the
    Lichess puzzle database (CC0).

## Storage (researched and built Nov 2026)

Today everything (mistake bank, notes, day summaries, engine cache) lives in one browser's localStorage. The app
already asks the browser to keep it (`navigator.storage.persist()`), but clearing site data or switching devices
loses it.

| Option | Cost | Verdict |
| --- | --- | --- |
| **Private GitHub repo via Contents API + fine-grained PAT** | $0 | **Recommended.** No backend, no pausing, free version history. `api.github.com` sends CORS headers for browser calls. PAT scoped to one data repo (Contents read/write), pasted once per device, kept in localStorage. ~150 lines. |
| Secret Gist + PAT | $0 | Works, but secret gists are readable by anyone with the URL and the token covers all gists. |
| Supabase free | $0 | Nice auth, but free projects pause after 1 week of inactivity. |
| Firebase Spark | $0 | Doesn't pause, offline cache built in; heavier SDK, Google lock-in. |
| Cloudflare Worker + D1/KV | $0 | Solid, but it's a backend to deploy and maintain. |
| File System Access API (iCloud folder) | — | Not viable: no Safari/iOS support. |
| GitHub OAuth device flow | — | Not viable from a static site: github.com/login endpoints send no CORS headers (needs a proxy). |

**Step 1 (stopgap): Export / Import backup.** One versioned JSON file `{schemaVersion, exportedAt, bank, notes, days}`;
import merges per item by `updatedAt`. Nudge when the last export is >7 days old.

**Step 2: GitHub sync, local-first.** Data repo `conceitedengineering/chess-coach-data` (private), files
`bank.json`, `notes.json`, `days.json` (engine cache stays local). On load and when the tab regains focus: GET each
file (keep its `sha`), merge per item with last-write-wins on `updatedAt` (deletions as `deleted: true` tombstones),
save locally. After changes: debounce ~10s, PUT with the `sha`; on 409/422 re-pull, re-merge, retry. Show
"Synced 2 min ago". Rotate the PAT yearly. Rate limits (5,000 req/h) are a non-issue with debouncing.

## Deliberately avoiding

From player complaints about other tools: "Brilliant" labels, estimated game ratings, putting accuracy front and
center, flagging tiny (0.1 pawn) differences, calling long engine combinations "missed wins", and extra clicks
between finishing a game and seeing the lesson.
