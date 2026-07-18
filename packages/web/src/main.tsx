import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { seedExampleSessionsOnce } from "./db/exampleSeeds";
import "./index.css";

seedExampleSessionsOnce().catch((err) => {
  console.error("[gitfs] example_seed_failed", err);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
