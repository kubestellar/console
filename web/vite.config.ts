import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import istanbul from 'vite-plugin-istanbul'
import { compression } from 'vite-plugin-compression2'
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
    // Strip console/debugger in production (replaces terser drop_console).
    // Use a no-op arrow function instead of 'undefined' to avoid
    // `undefined()` crashes in vendor code that calls globalThis.console.*.
    ...(mode === 'production' ? {
      'globalThis.console.log': '(()=>{})',
      'globalThis.console.info': '(()=>{})',
      'globalThis.console.debug': '(()=>{})',
      'globalThis.console.trace': '(()=>{})',
    } : {}),
  },
  plugins: [
    react({
      // React Compiler disabled — it strips useCallback/useMemo that are
      // load-bearing for useLayoutEffect dependency stability in CardDataContext,
      // causing infinite re-render loops (React error #185) in production builds.
      // Re-enable only after adding 'use no memo' directives to all affected files.
    }),
    // Inject build commit hash into the HTML <meta name="app-build-id"> tag
    // so the stale-HTML detection script can compare against the server.
    {
      name: 'inject-build-id',
      transformIndexHtml(html: string) {
        return html.replace('__COMMIT_HASH__', process.env.VITE_COMMIT_HASH || getGitCommitHash())
      },
    },
    // Pre-compress assets at build time — avoids chunked encoding on slow networks
    compression({ algorithms: ['gzip'], exclude: [/\.(br)$/], threshold: 1024 }),
    compression({ algorithms: ['brotliCompress'], exclude: [/\.(gz)$/], threshold: 1024 }),
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
    // Vite 8 uses Oxc minifier by default (replaces terser/esbuild).
    // drop_console equivalent is handled via rolldownOptions.output.
    rolldownOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return
          // React ecosystem must stay together (shared hooks/context internals).
          // react-reconciler is a React internal used by @react-three — keep it
          // here to avoid circular dep between vendor ↔ three-vendor.
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router') || id.includes('/scheduler/') || id.includes('/react-reconciler/')) {
            return 'react-vendor'
          }
          // 3D engine — three.js + @react-three (~400KB) only used by
          // globe animation and KubeCraft3D card; isolate so they never
          // load on normal page views. zustand is a transitive dep of
          // @react-three (not used directly), so keep it with three.
          // react-reconciler is already in react-vendor above.
          if (id.includes('/three/') || id.includes('/three-stdlib/') || id.includes('/@react-three/') || id.includes('/zustand/') || id.includes('/stats-gl/')) {
            return 'three-vendor'
          }
          // ECharts — only used by ParetoFrontier card; isolate the large
          // (~500KB minified) echarts + zrender bundle from recharts.
          if (id.includes('/echarts/') || id.includes('/echarts-for-react/') || id.includes('/zrender/')) {
            return 'echarts-vendor'
          }
          // Recharts + d3 — used widely across chart cards.
          if (id.includes('/recharts/') || id.includes('/d3-') || id.includes('/victory-')) {
            return 'recharts-vendor'
          }
          // Animation — framer-motion is large (~350KB) and only needed on pages
          // that use <motion.*> or AnimatePresence, so isolate it from core UI deps.
          if (id.includes('/framer-motion/')) {
            return 'motion-vendor'
          }
          // Terminal emulator — only needed when a pod exec drilldown is opened.
          // Isolate so xterm never loads on normal page views.
          if (id.includes('/@xterm/')) {
            return 'xterm-vendor'
          }
          // Core UI interaction (icons + drag-and-drop)
          if (id.includes('/lucide-react/') || id.includes('/@dnd-kit/')) {
            return 'ui-vendor'
          }
          // Markdown rendering — only loaded when the AI mission sidebar is open.
          // Includes the full unified/remark/rehype ecosystem to avoid circular
          // deps with the vendor chunk.
          if (
            id.includes('/react-markdown/') ||
            id.includes('/remark-') ||
            id.includes('/rehype-') ||
            id.includes('/micromark') ||
            id.includes('/mdast-') ||
            id.includes('/hast-') ||
            id.includes('/unist-') ||
            id.includes('/unified/') ||
            id.includes('/bail/') ||
            id.includes('/is-plain-obj/') ||
            id.includes('/trough/') ||
            id.includes('/vfile') ||
            id.includes('/property-information') ||
            id.includes('/zwitch') ||
            id.includes('/stringify-entities') ||
            id.includes('/ccount') ||
            id.includes('/character-entities') ||
            id.includes('/comma-separated-tokens') ||
            id.includes('/space-separated-tokens') ||
            id.includes('/decode-named-character-reference') ||
            id.includes('/devlop') ||
            id.includes('/estree-')
          ) {
            return 'markdown-vendor'
          }
          // Sucrase JS compiler — only used when editing/previewing dynamic cards;
          // isolate it so the ~150 KB compiler never loads on normal page views.
          if (id.includes('/sucrase/')) {
            return 'sucrase-vendor'
          }
          // Internationalization
          if (id.includes('/i18next') || id.includes('/react-i18next/')) {
            return 'i18n-vendor'
          }
          return 'vendor'
        },
      },
    },
    // Warn when any chunk exceeds 300 KB after minification, matching the
    // Auto-QA performance threshold so CI catches regressions early.
    chunkSizeWarningLimit: 300,
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
    proxy: (() => {
      // When the watchdog runs with TLS on port 8080, the backend listens
      // on BACKEND_LISTEN_PORT (default 8081) in plain HTTP. Proxy directly
      // to the backend to avoid "Client sent an HTTP request to an HTTPS server".
      const backendPort = process.env.BACKEND_LISTEN_PORT || '8081'
      const target = `http://localhost:${backendPort}`
      const wsTarget = `ws://localhost:${backendPort}`
      const opts = { target, changeOrigin: true }
      return {
        '/api': { ...opts },
        '/health': { ...opts },
        '/auth/github': { ...opts },
        '/auth/github/callback': { ...opts },
        '/auth/refresh': { ...opts },
        '/api/m': { ...opts },
        '/ws': { target: wsTarget, ws: true },
      }
    })(),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'e2e/**/*'],
    teardownTimeout: process.env.CI ? 60_000 : 10_000, // CI runners need more time to terminate workers
    // CI runners (2-core, 7GB) OOM with 600+ test files at full concurrency
    maxWorkers: process.env.CI ? 2 : undefined,
    minWorkers: process.env.CI ? 1 : undefined,
    poolOptions: {
      forks: {
        // Prevent "Timeout terminating forks worker" on slow CI runners
        terminateTimeout: process.env.CI ? 60_000 : 10_000,
        maxForks: process.env.CI ? 2 : undefined,
        minForks: process.env.CI ? 1 : undefined,
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      include: [
        'src/hooks/**',
        'src/lib/**',
        'src/contexts/**',
        'src/components/charts/**',
        'src/components/dashboard/customizer/**',
        'src/components/dashboard/shared/cardCatalog.ts',
        'src/components/dashboard/shared/CardPreview.tsx',
      ],
      exclude: [
        'node_modules/',
        'e2e/',
        'src/test/',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/*.d.ts',
        '**/demo*Data*.{ts,tsx}',
        '**/icons.{ts,tsx}',
      ],
    },
  },
}))
