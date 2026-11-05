import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build` → dist/ (deployable, hashed assets).
// `vite build --mode demo` → dist-demo/index.html, one self-contained file for quotations (opens from disk).
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    base: './',
    plugins: demo ? [viteSingleFile()] : [],
    build: {
      outDir: demo ? 'dist-demo' : 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 1500,
    },
  };
});
