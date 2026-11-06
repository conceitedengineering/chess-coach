import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Production builds are served from https://conceitedengineering.github.io/chess-coach/
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/chess-coach/" : "/",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
}));
