import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Library / embed build — outputs a single self-contained JS bundle
// Usage on any website:
//   <div id="bugcal-root"></div>
//   <script type="module" src="bugcal.embed.js"></script>
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-embed',
    lib: {
      entry: 'src/embed.jsx',
      name: 'BugCal',
      fileName: () => 'bugcal.embed.js',
      formats: ['iife'],   // single self-executing file, no bundler needed on the host site
    },
    rollupOptions: {
      // Bundle React in — host page doesn't need to provide it
      external: [],
    },
  },
})
