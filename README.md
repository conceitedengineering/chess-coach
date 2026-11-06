# Chess Coach

Analyze a day of [SultanofStalemates](https://www.chess.com/member/SultanofStalemates)'s Chess.com games with Stockfish 19, running entirely in the browser.

**Live:** https://conceitedengineering.github.io/chess-coach/

The page opens on the most recent day with games. The player is set in `src/config.ts`. Every push to `main` redeploys via GitHub Actions.

```bash
npm install   # also copies the Stockfish WASM engine into public/engine
npm run dev   # http://localhost:5173
```

## How it works

- **Games**: `src/games.ts` pulls the day's games from the public Lichess export API or the Chess.com monthly archive (no API keys).
- **Engine**: `src/engine.ts` runs a pool of up to 4 single-threaded Stockfish 19 lite WASM workers (`stockfish` npm package).
- **Analysis**: `src/analysis.ts` turns evals into win % (Lichess formula) and classifies each of your moves:
  - inaccuracy / mistake / blunder: win % drop of 5 / 10 / 15 points (Lichess thresholds)
  - miss: your opponent just erred (−10 % or more) and your reply gave at least 10 % back, or you missed a mate in 5 or fewer
  - tags: left material hanging, missed tactic, missed/allowed mate, threw away a winning position
- **UI**: React + Tailwind v4 + shadcn/ui (dark by default, light/system via the header toggle). `src/App.tsx` routes between
  `Summary`, `GameReview` and `Drill` in `src/components/`. The board is Lichess's chessground (`ChessBoard.tsx`, themed in `src/board.css`).

Results are cached in localStorage per game and depth, so re-opening a day is instant.

Stockfish is GPLv3. If you distribute this app with the engine, publish your source too.
