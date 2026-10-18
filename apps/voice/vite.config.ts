import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { voiceBuildInfo } from "./build-info.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const info = voiceBuildInfo(fileURLToPath(new URL("../..", import.meta.url)));

export default defineConfig({
  root,
  base: "./",
  define: { __BLIP_BUILD_ID__: JSON.stringify(info.id) },
  plugins: [{
    name: "blip-build-identity",
    transformIndexHtml: () => [{ tag: "meta", attrs: { name: "blip-build", content: info.id }, injectTo: "head" }],
    generateBundle() { this.emitFile({ type: "asset", fileName: "blip-build.json", source: JSON.stringify(info) }); },
  }],
  build: { outDir: "dist", emptyOutDir: true },
});
