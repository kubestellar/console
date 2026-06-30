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
    // We extract just the version prefix (v0.3.6-nightly.20260124)
    const raw = execSync('git describe --tags --always 2>/dev/null', {
      encoding: 'utf-8',
    }).trim()
    // If tag matches semver-like pattern, use as-is; otherwise use short SHA
    return raw.startsWith('v') ? raw : `dev-${raw}`
  } catch {
    return 'dev-unknown'
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    ...(isE2ECoverage
      ? [
          istanbul({
            include: 'src/**/*',
            exclude: ['node_modules', 'e2e/', 'src/test/'],
            extension: ['.ts', '.tsx'],
            requireEnv: false,
            forceBuildInstrument: true,
          }),
        ]
      : []),
    ...(mode === 'production'
      ? [
          compression({
            algorithm: 'gzip',
            threshold: 10240,
          }),
        ]
      : []),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(getGitVersion()),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:4000',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          charts: ['recharts'],
        },
      },
    },
  },
  // Enable Istanbul instrumentation for E2E coverage
  ...(isE2ECoverage && {
    build: {
      sourcemap: true,
    },
  }),
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'node_modules/',
      'dist/',
      'e2e/',
      '.next/',
      'coverage/',
    ],
    // Vitest pool configuration for stability:
    // - forks (default in Vitest 4+) isolates each test file in a subprocess
    // - maxWorkers caps parallelism to avoid OOM on CI
    pool: 'forks',
    maxWorkers: process.env.CI ? 4 : undefined,
    minWorkers: 1,
    // Timeout for worker teardown after tests complete (ms).  Prevents
    // leaked handles from stalling CI.  Default is 1000 ms; raise if tests
    // that spawn child processes need more cleanup time.
    teardownTimeout: 5000,
    // Test-level timeout: 10 s per test.  Prevents runaway async operations
    // (e.g. unresolved fetch mocks) from stalling the suite indefinitely.
    testTimeout: 10000,
    // Fail fast: stop on the first test failure to surface errors earlier
    // and reduce wasted CI minutes.  Disabled locally for exploratory runs.
    bail: process.env.CI ? 1 : 0,
    // --- Retry flaky tests (CI only) ---
    // Playwright-style retry: tests that fail on first attempt are retried up
    // to 2 times before being reported as a hard failure.  This keeps the
    // Coverage Suite green through transient timing issues (e.g. RAF-based
    // animations, IntersectionObserver mocks) without masking real regressions
    // because a test that fails 3 times in a row still fails the run.
    retry: process.env.CI ? 2 : 0,
    // --- Reporter configuration ---
    reporters: process.env.CI
      ? ['default', 'junit']
      : ['default'],
    outputFile: process.env.CI
      ? { junit: './test-results/junit.xml' }
      : undefined,
    // --- Snapshot settings ---
    snapshotFormat: {
      escapeString: true,
      printBasicPrototype: false,
    },
    // --- Module resolution ---
    alias: {
      '@/': new URL('./src/', import.meta.url).pathname,
    },
    // --- CSS handling ---
    css: {
      modules: {
        classNameStrategy: 'non-scoped',
      },
    },
    // --- Dependency pre-bundling for test environment ---
    deps: {
      optimizer: {
        web: {
          include: [
            'recharts',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
          ],
        },
      },
    },
    // --- Sharding support ---
    // When VITEST_SHARD is set (e.g., "1/12"), Vitest only runs tests
    // in that shard.  Each shard is an independent CI job.
    ...(process.env.VITEST_SHARD && {
      shard: process.env.VITEST_SHARD,
    }),
    // --- Mock configuration ---
    mockReset: true,
    restoreMocks: true,
    // unstubEnvs/unstubGlobals reset env overrides between tests (Vitest 2+)
    unstubEnvs: true,
    unstubGlobals: true,
    // poolOptions.forks removed — deprecated in Vitest 4 (#5860).
    // maxWorkers/minWorkers above handle fork limits; teardownTimeout
    // above handles worker termination timeout.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      include: [
        'src/**/*.{ts,tsx}',
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
      // Per-directory coverage thresholds prevent silent regression in
      // chronically under-tested directories. Ratchet these up as tests are added.
      // NOTE: Disabled — thresholds are incompatible with sharded vitest runs
      // (each shard only covers a subset of files, so per-directory thresholds
      // always fail in shards that don't include matching tests). Re-enable once
      // coverage is merged before threshold evaluation.
      // thresholds: {
      //   '**/hooks/**': { lines: 20, functions: 20, branches: 20, statements: 20 },
      //   '**/services/**': { lines: 60, functions: 60, branches: 60, statements: 60 },
      // },
    },
  },
}))
