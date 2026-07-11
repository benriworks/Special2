import { defineConfig } from "vite";

export default defineConfig({
  base: "/Special2/",
  build: {
    target: "es2022",
    sourcemap: true,
    // Three.js is intentionally loaded up front because the intro is already
    // a live specimen; the resulting bundle is ~152 kB over the wire (gzip).
    chunkSizeWarningLimit: 650,
  },
});
