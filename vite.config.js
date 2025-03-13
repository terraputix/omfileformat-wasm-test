import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default {
  plugins: [wasm(), topLevelAwait()],
  // Base public path when served
  base: "./",

  // Development server config
  server: {
    port: 3000,
    open: true,
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  optimizeDeps: {
    exclude: ["/wasm/om_reader_wasm.js"],
  },
  assetsInclude: ["**/*.wasm", "/wasm/om_reader_wasm.js"],

  build: {
    sourcemap: true,
    assetsInlineLimit: 0,
  },
};
