import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import istanbul from 'vite-plugin-istanbul'
import { execSync } from 'child_process'
import path from 'path'

const isE2ECoverage = process.env.VITE_COVERAGE === 'true'

// Get git version from tags (e.g., v0.3.6-nightly.20260124)
function getGitVersion(): string {
  try {
    // git describe gives: v0.3.6-nightly.20260124-11-g23946568
    // We extract just the tag part for display
    const describe = execSync('git describe --tags --always', { encoding: 'utf-8' }).trim()
    // If it's a clean tag (no commits since), return as-is
    // If it has commits since tag, extract the base tag
    const match = describe.match(/^(v[\d.]+(?:-[^-]+)?(?:\.[^-]+)?)/)
    return match ? match[1] : describe
  } catch {
    return '0.0.0'
  }
}

// Get git commit hash at build time
function getGitCommitHash(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    // Version from git tags, can be overridden by VITE_APP_VERSION for CI/CD
    __APP_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION || getGitVersion()),
    __COMMIT_HASH__: JSON.stringify(process.env.VITE_COMMIT_HASH || getGitCommitHash()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    // Dev mode is true in development unless explicitly overridden
    __DEV_MODE__: process.env.VITE_DEV_MODE !== undefined
      ? JSON.stringify(process.env.VITE_DEV_MODE === 'true')
      : JSON.stringify(mode === 'development'),
  },
  plugins: [
    react(),
    // Enable Istanbul instrumentation for E2E coverage
    isE2ECoverage &&
      istanbul({
        include: 'src/*',
        exclude: ['node_modules', 'e2e/**', '**/*.spec.ts', '**/*.test.ts'],
        extension: ['.js', '.ts', '.tsx', '.jsx'],
        requireEnv: false,
        forceBuildInstrument: true,
      }),
  ].filter(Boolean),
  build: {
    // Enable minification optimizations
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.trace'],
      },
    },
    rollupOptions: {
      output: {
manualChunks: (id) => {
          // IMPORTANT: Libraries that use React hooks/context MUST go in vendor chunk
          // Splitting them separately causes "undefined" errors for useLayoutEffect, createContext, etc.
          // Keep all node_modules in a single vendor chunk to avoid circular dependencies
          if (id.includes('node_modules')) {
            return 'vendor'
          }
        },
      },
    },
  },
  server: {
    port: 5174,
    strictPort: true, // Fail if port 5174 is already in use
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/auth/github': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/auth/github/callback': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/auth/refresh': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'e2e/**/*'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'e2e/',
        'src/test/',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
      ],
    },
  },
}))
