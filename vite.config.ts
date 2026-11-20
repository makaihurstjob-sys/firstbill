import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { viteSingleFile } from "vite-plugin-singlefile";

// `npm run build` -> normal static site (GitHub Pages, Lovable, Vercel).
// `npm run build:single` -> one self-contained HTML file (used for the claude.ai live demo).
export default defineConfig(({ mode }) => ({
  base: "./",
  server: { host: "::", port: 8080 },
  plugins: [react(), mode === "single" && viteSingleFile()].filter(Boolean),
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: mode === "single" ? { outDir: "dist-single", assetsInlineLimit: 100000000 } : undefined,
}));
