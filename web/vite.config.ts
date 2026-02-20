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
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
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
    warmup: {
      // Pre-transform route and card modules on server start so navigation
      // doesn't pay the cold module-transform penalty.
      clientFiles: [
        // Route components (most-used routes first)
        './src/components/cluster-admin/ClusterAdmin.tsx',
        './src/components/dashboard/Dashboard.tsx',
        './src/components/dashboard/CustomDashboard.tsx',
        './src/components/clusters/Clusters.tsx',
        './src/components/events/Events.tsx',
        './src/components/workloads/Workloads.tsx',
        './src/components/compute/Compute.tsx',
        './src/components/nodes/Nodes.tsx',
        './src/components/deployments/Deployments.tsx',
        './src/components/pods/Pods.tsx',
        './src/components/services/Services.tsx',
        './src/components/storage/Storage.tsx',
        './src/components/network/Network.tsx',
        './src/components/security/Security.tsx',
        './src/components/gitops/GitOps.tsx',
        './src/components/alerts/Alerts.tsx',
        './src/components/cost/Cost.tsx',
        './src/components/compliance/Compliance.tsx',
        './src/components/operators/Operators.tsx',
        './src/components/helm/HelmReleases.tsx',
        './src/components/gpu/GPUReservations.tsx',
        './src/components/data-compliance/DataCompliance.tsx',
        './src/components/logs/Logs.tsx',
        './src/components/deploy/Deploy.tsx',
        './src/components/aiml/AIML.tsx',
        './src/components/aiagents/AIAgents.tsx',
        './src/components/cicd/CICD.tsx',
        './src/components/arcade/Arcade.tsx',
        './src/components/marketplace/Marketplace.tsx',
        './src/components/llmd-benchmarks/LLMdBenchmarks.tsx',
        './src/components/settings/Settings.tsx',
        './src/components/namespaces/NamespaceManager.tsx',
        // Card registries and bundles
        './src/components/cards/cardRegistry.ts',
        './src/components/cards/deploy-bundle.ts',
        './src/components/cards/llmd/index.ts',
        './src/components/cards/workload-detection/index.ts',
        './src/components/cards/workload-monitor/index.ts',
        './src/components/cards/kagenti/index.ts',
        './src/App.tsx',
      ],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/health': {
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
      '/api/m': {
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
