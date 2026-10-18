import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "apps/web",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/health": "http://localhost:3000",
    },
  },
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
  },
});
