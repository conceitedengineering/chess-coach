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

## Next up (small, one at a time)

1. **"What was I thinking?" note** on each key moment and drill position, saved locally, shown again at review time.
   Coaches universally recommend writing this before checking the engine; almost no tool supports it. *Effort: small.*
2. **Opening names and "errors by opening"** from Lichess's CC0 openings list
   (https://github.com/lichess-org/chess-openings, ~3.5k lines of TSV). Tag each game by deepest matching position;
   summary card "Where you left book". Later: personal opening tree with W/L per move (openingtree.com idea). *Effort: small.*
3. **Trends over weeks**: save each day's summary (blunders/game, error causes, time-trouble share) and chart it.
   *Effort: small–medium.*
4. **Endgame verdicts** with ≤7 pieces from the Lichess tablebase API (no auth, CORS open:
   `https://tablebase.lichess.org/standard?fen=…`), e.g. "winning → drawn". *Effort: small.*

## Later (medium)

5. **Real tactic motifs** (fork, pin, skewer, discovered attack, back-rank, removing the defender) detected on the
   engine's best line → "Missed forks ×5" dashboard and drill-by-motif.
   Port rules from chess_detect (MIT, https://github.com/aslyamov/chess_detect) or reimplement lichess-puzzler's tagger
   ideas (AGPL, https://github.com/ornicar/lichess-puzzler/tree/master/tagger). ~400–600 lines TS.
6. **Blunder-check gate / "Find the threat" drill** (Heisman): after choosing a move, name the opponent's most
   dangerous reply; or, after their move, play the threat they just created.
7. **Convert winning positions** (Aimchess "Advantage Capitalization"): positions where you had ≥80% and didn't win,
   replayed against a weakened Stockfish (`Skill Level` / `UCI_LimitStrength`).
8. **Woodpecker / speed mode**: timed runs through the bank, each cycle at half the previous time. Only use
   "one clear best move" positions (MultiPV 2, best ≥ ~150cp ahead of second) so reasonable alternatives aren't punished.
9. **Lichess-style tolerance setting**: optionally accept any move within ~4% win chance of the best
   (lila `retroCtrl.ts`). Off by default, since we decided to require the best move.

## Someday (bigger)

10. **Maia, a human-like engine** (https://huggingface.co/bqrio/maia3-onnx, ~11MB fp16, onnxruntime-web):
    "what would an 800 / 1100 / 1500 player play here", "how normal is this blunder at your rating". ~1 day.
11. **Mixed sessions**: your mistakes plus fresh puzzles on your weakest theme, from a small bundled subset of the
    Lichess puzzle database (CC0).
12. **Backfill**: analyze the last 7–30 days in the background so the bank fills up even on days you don't open the app.

## Deliberately avoiding

From player complaints about other tools: "Brilliant" labels, estimated game ratings, putting accuracy front and
center, flagging tiny (0.1 pawn) differences, calling long engine combinations "missed wins", and extra clicks
between finishing a game and seeing the lesson.
