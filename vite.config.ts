import { defineConfig } from 'vite'
import { resolve } from 'path'
import path from 'path'

export default defineConfig(({ mode }) => {
  const isE2E = mode === 'e2e'
  
  return {
    root: isE2E ? 'e2e' : undefined,
    base: '/',
    build: {
      lib: {
        entry: resolve(__dirname, 'src/index.ts'),
        name: 'neverchange',
        fileName: (format) => `neverchange.${format}.js`
      },
      rollupOptions: {
        external: ['@sqlite.org/sqlite-wasm'],
        output: {
          globals: {
            '@sqlite.org/sqlite-wasm': 'sqlite3InitModule'
          }
        }
      },
      commonjsOptions: {
        include: [/@sqlite\.org\/sqlite-wasm/, /node_modules/]
      }
    },
    server: {
      port: isE2E ? 3001 : 3000,
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '/src': path.resolve(__dirname, './src')
      }
    },
    optimizeDeps: {
      exclude: ['@sqlite.org/sqlite-wasm']
    },
    // @ts-ignore
    test: {
      include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
      exclude: ['e2e/**/*', 'node_modules/**/*']
    },
  }
})
