import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./board.css";
import { App } from "./App";
import { ThemeProvider } from "./theme";
import { TooltipProvider } from "@/components/ui/tooltip";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider delayDuration={200}>
        <App />
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
);
