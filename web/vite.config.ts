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
          const sourceChunkRules = [
            ['card-registry', ['/src/components/cards/cardRegistry.ts']],
            ['card-registry-data', ['/src/config/cards/', '/src/components/cards/cardMetadata.ts', '/src/components/cards/cardDescriptors.registry.ts']],
            ['dashboard-core', ['/src/components/dashboard/', '/src/lib/dashboards/', '/src/lib/unified/dashboard/']],
            ['app-shell', ['/src/App.tsx', '/src/components/layout/', '/src/lib/auth/', '/src/hooks/useBranding', '/src/hooks/useTheme', '/src/hooks/usePersistedSettings']],
            ['i18n-app', ['/src/lib/i18n.ts', '/src/locales/']],
          ] as const
          for (const [chunkName, needles] of sourceChunkRules) {
            if (needles.some(needle => id.includes(needle))) return chunkName
          }
          if (!id.includes('node_modules')) return
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router') || id.includes('/scheduler/') || id.includes('/react-reconciler/')) return 'react-vendor'
          if (id.includes('/three-stdlib/')) return 'three-stdlib-vendor'
          if (id.includes('/@react-three/') || id.includes('/zustand/') || id.includes('/stats-gl/')) return 'three-react-vendor'
          if (id.includes('/three/')) return 'three-core-vendor'
          if (id.includes('/zrender/')) return 'zrender-vendor'
          if (id.includes('/echarts-for-react/')) return 'echarts-react-vendor'
          if (id.includes('/echarts/')) return 'echarts-vendor'
          if (id.includes('/framer-motion/')) return 'motion-vendor'
          if (id.includes('/@xterm/addon-fit/')) return 'xterm-addon-vendor'
          if (id.includes('/@xterm/')) return 'xterm-vendor'
          if (id.includes('/lucide-react/') || id.includes('/@dnd-kit/')) return 'ui-vendor'
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
          ) return 'markdown-vendor'
          if (id.includes('/sucrase/')) return 'sucrase-vendor'
          if (id.includes('/@codemirror/legacy-modes/')) return 'codemirror-modes-vendor'
          if (id.includes('/@uiw/react-codemirror/')) return 'codemirror-react-vendor'
          if (id.includes('/@codemirror/') || id.includes('/codemirror/') || id.includes('/@lezer/')) return 'codemirror-core-vendor'
          if (id.includes('/i18next-browser-languagedetector/')) return 'i18n-detector-vendor'
          if (id.includes('/i18next') || id.includes('/react-i18next/')) return 'i18n-vendor'
          if (id.includes('/js-yaml/')) return 'yaml-vendor'
          if (id.includes('/dompurify/')) return 'sanitize-vendor'
          if (id.includes('/zod/')) return 'schema-vendor'
          if (id.includes('/@tanstack/react-virtual/')) return 'virtual-vendor'
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
        '/auth/manifest/setup': { ...opts },
        '/auth/manifest/callback': { ...opts },
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
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'netlify/functions/__tests__/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'e2e/**/*'],
    // Retry flaky tests up to 2 times in CI to reduce false-positive workflow failures (#11872)
    retry: process.env.CI ? 2 : 0,
    teardownTimeout: process.env.CI ? 120_000 : 10_000, // CI: increased from 60s to 120s for worker cleanup stability (#10436)
    // CI runners (2-core, 7GB) OOM with 600+ test files at full concurrency
    maxWorkers: process.env.CI ? 2 : undefined,
    minWorkers: process.env.CI ? 1 : undefined,
    // poolOptions.forks removed — deprecated in Vitest 4 (#5860).
    // maxWorkers/minWorkers above handle fork limits; teardownTimeout
    // above handles worker termination timeout.
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
        '**/*.md',
        '**/demo*Data*.{ts,tsx}',
        '**/icons.{ts,tsx}',
        // Barrel re-export files: V8 cannot count ESM re-export bindings as
        // executable lines. These files contain only `export { } from` or
        // `export * from` statements with no executable logic — excluding them
        // prevents structurally-uncoverable lines from dragging down the metric.
        'src/lib/analytics.ts',
        'src/hooks/useMCP.ts',
        'src/hooks/useCachedKeda.ts',
        // lib/demo barrel re-exports: each of these is a thin `export { } from`
        // wrapper pointing at the card-level demoData. V8 cannot mark ESM
        // re-export bindings as covered even when tests import them — same issue
        // as src/lib/analytics.ts. Exclude to prevent 0% drag.
        'src/lib/demo/chaos_mesh.ts',
        'src/lib/demo/dapr.ts',
        'src/lib/demo/envoy.ts',
        'src/lib/demo/grpc.ts',
        'src/lib/demo/keda.ts',
        'src/lib/demo/kubevela.ts',
        'src/lib/demo/linkerd.ts',
        'src/lib/demo/openfeature.ts',
        'src/lib/demo/openfga.ts',
        'src/lib/demo/spiffe.ts',
        'src/lib/demo/strimzi.ts',
        'src/lib/demo/volcano.ts',
        'src/lib/demo/wasmcloud.ts',
        // Type-only files: pure TypeScript interfaces/types compile to no JS bytecode.
        'src/lib/cache/workerMessages.ts',
        'src/hooks/mcp/types.ts',
        // Dead code: not imported by any production module (app uses useMissions.tsx).
        'src/hooks/useMissions.provider.tsx',
      ],
    },
  },
}))
