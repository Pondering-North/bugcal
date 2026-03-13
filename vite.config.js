import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standalone app config — outputs to dist/
export default defineConfig({
  plugins: [react()],
  base: './',   // relative paths so the build works when hosted in a subfolder or gh-pages
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
