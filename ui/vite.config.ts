import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import os from "node:os";

export default defineConfig({
  plugins: [react()],
  cacheDir: path.join(os.tmpdir(), "vite-m_m_optimizer"),
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") },
    },
  },
});
