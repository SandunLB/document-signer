import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        validator: resolve(__dirname, 'validator.html')
      },
      output: {
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    },
    outDir: 'dist',
    assetsDir: 'assets'
  },
  optimizeDeps: {
    include: ['crypto-js', 'pdf-lib']
  },
  server: {
    port: 3000
  },
  base: './'
});