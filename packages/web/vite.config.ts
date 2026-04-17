import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  // Ensure generated asset URLs stay rooted at domain root.
  base: "/",
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      include: ["zlib", "buffer", "stream", "util", "path", "process"],
      globals: { Buffer: true, process: true },
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      "/sandbox": "http://localhost:8787",
      "/ws": {
        target: "http://localhost:8787",
        ws: true,
      },
      "/health": "http://localhost:8787",
      "/oauth": "http://localhost:8787",
      "/copilot-api": "http://localhost:8787",
      "/anthropic-api": "http://localhost:8787",
    },
  },
});
