import { defineConfig } from 'vite';

// Minimal Vite config — the project is plain ES modules, no build plugins needed.
export default defineConfig({
  // Relative asset paths so the build works from itch.io's subdirectory hosting.
  base: './',
  server: {
    host: true,  // expose on local network
    open: true,  // auto-open the browser on `npm run dev`
  },
});
