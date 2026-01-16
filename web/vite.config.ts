import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import istanbul from 'vite-plugin-istanbul'

const isE2ECoverage = process.env.VITE_COVERAGE === 'true'

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '0.1.0'),
    __COMMIT_HASH__: JSON.stringify(process.env.VITE_COMMIT_HASH || 'dev'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
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
  server: {
    port: 5174,
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
})
