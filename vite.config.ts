import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { viteSingleFile } from "vite-plugin-singlefile";

// Build stamp: shown on the start screen, and written to version.json so the Home Screen app reloads when a new build is live.
const BUILD = new Date().toISOString();
const versionFile = {
  name: "version-file",
  generateBundle() {
    // @ts-expect-error rollup plugin context
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD }) });
  },
};

// `npm run build` -> normal static site (GitHub Pages, Lovable, Vercel).
// `npm run build:single` -> one self-contained HTML file (used for the claude.ai live demo).
export default defineConfig(({ mode }) => ({
  base: "./",
  server: { host: "::", port: 8080 },
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [react(), versionFile, mode === "single" && viteSingleFile()].filter(Boolean),
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: mode === "single" ? { outDir: "dist-single", assetsInlineLimit: 100000000 } : undefined,
}));
