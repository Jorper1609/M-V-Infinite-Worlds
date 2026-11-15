import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  publicDir: 'public',
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3307', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:3307', ws: true }
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ },
            { name: 'physics', test: /[\\/]node_modules[\\/]@dimforge[\\/]rapier3d-compat[\\/]/ }
          ]
        }
      }
    }
  }
});
