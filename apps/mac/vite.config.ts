import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // the built page is opened from a file inside the app, so every address in it is relative
  base: "./",
  resolve: { tsconfigPaths: true },
  server: { port: 3210, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  plugins: [
    tailwindcss(),
    viteReact(),
    // The built board loads only its own code, with no scripts from anywhere else. (Pages on the board are webviews of
    // their own, outside this rule.) Development is left without it: its tooling injects scripts of its own.
    {
      name: "weld-csp",
      apply: "build",
      transformIndexHtml: (html) =>
        html.replace(
          "<head>",
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: http:; font-src 'self' data:; connect-src 'self'; media-src 'self' data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'" />`,
        ),
    },
  ],
});
