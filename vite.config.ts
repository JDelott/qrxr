import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist', // This is where the built files will go
  },
  server: {
    port: 5174,
    host: true,
    hmr: true,
    watch: {
      usePolling: true,
      interval: 1, // Ultra-aggressive polling
    },
  },
  optimizeDeps: {
    force: true,
    esbuildOptions: {
      target: 'esnext'
    }
  },
  esbuild: {
    target: 'esnext'
  }
})
