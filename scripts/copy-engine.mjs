// Copies the Stockfish WASM engine into public/ so Vite serves it as a Web Worker.
import { mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const src = join("node_modules", "stockfish", "bin");
const dest = join("public", "engine");
mkdirSync(dest, { recursive: true });
for (const f of ["stockfish-19-lite-single.js", "stockfish-19-lite-single.wasm"]) {
  copyFileSync(join(src, f), join(dest, f));
}
console.log("Copied Stockfish engine to public/engine");
