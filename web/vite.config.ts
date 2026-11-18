import { defineConfig } from "vite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
// Ship the same PDF decoders, character maps and fonts in dev, Pages and the offline app.
function paperAssets(): Plugin {
  const root = fileURLToPath(
    new URL("./node_modules/pdfjs-dist/", import.meta.url),
  );
  const files = new Set([
    "LICENSE",
    ...["cmaps", "standard_fonts", "iccs", "wasm"].flatMap((dir) =>
      readdirSync(root + dir)
        .filter((file) => !file.toLowerCase().includes("quickjs"))
        .map((file) => dir + "/" + file),
    ),
  ]);
  return {
    name: "paper-pdf-assets",
    configureServer(server) {
      server.middlewares.use("/paper-pdf", (request, response, next) => {
        const path = (request.url || "").slice(1);
        if (!files.has(path)) return next();
        if (path.endsWith(".wasm"))
          response.setHeader("Content-Type", "application/wasm");
        if (path.endsWith(".js"))
          response.setHeader("Content-Type", "text/javascript");
        response.end(readFileSync(root + path));
      });
    },
    generateBundle() {
      for (const path of files)
        this.emitFile({
          type: "asset",
          fileName: "paper-pdf/" + path,
          source: readFileSync(root + path),
        });
    },
  };
}
export default defineConfig({
  plugins: [react(), paperAssets()],
  base: "./",
  build: { outDir: "../site", emptyOutDir: true },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/legacy": "http://127.0.0.1:8787",
    },
  },
});
