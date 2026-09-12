import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Build config for `npm run smoke` only. jsdom cannot load `<script type="module">`, so the
 * smoke test needs the whole app as one classic IIFE script rather than the ES modules
 * `vite build` normally emits. Never used for anything shipped.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('../src/ui', import.meta.url)) } },
  define: { 'process.env.NODE_ENV': '"development"' },
  build: {
    outDir: 'smoke-build',
    emptyOutDir: true,
    minify: false,
    target: 'es2022',
    rollupOptions: {
      input: fileURLToPath(new URL('../src/ui/main.tsx', import.meta.url)),
      output: { format: 'iife', entryFileNames: 'app.js', inlineDynamicImports: true },
    },
  },
})
