import { defineConfig } from 'vite';

// VITE_BASE is set by the Pages workflow to "/<repo-name>/"; locally it stays "/".
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          gsap: ['gsap', 'gsap/ScrollTrigger'],
        },
      },
    },
  },
});
