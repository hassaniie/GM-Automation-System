import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build`              → dist/            local engine in the browser (Vercel, offline demo)
// `vite build --mode demo`  → dist-demo/index.html, one self-contained file for quotations (opens from disk)
// `vite build --mode edge`  → dist-edge/       screens that connect to the edge server, served by it
// `vite --mode edge`        → dev server; /api is proxied to the edge server on :8787
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo', edge = mode === 'edge';
  return {
    base: './',
    plugins: demo ? [viteSingleFile()] : [],
    server: { proxy: { '/api': { target: 'http://localhost:8787', ws: true } } },
    build: {
      outDir: demo ? 'dist-demo' : edge ? 'dist-edge' : 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 1500,
    },
  };
});
