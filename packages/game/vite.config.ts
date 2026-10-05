import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the build runs from any subpath (GitHub Pages
  // serves it under /<repo>/).
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1000,
  },
});
