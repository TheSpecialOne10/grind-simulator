import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { config as loadDotenv } from 'dotenv';

// Load .env so process.env has API_URL / API_KEY at build time
loadDotenv();

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        external: ['electron']
      }
    },
    define: {
      'import.meta.env.API_URL': JSON.stringify(process.env['API_URL'] ?? ''),
      'import.meta.env.API_KEY': JSON.stringify(process.env['API_KEY'] ?? ''),
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        external: ['electron']
      }
    }
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  }
});
