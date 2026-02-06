/**
 * Vitest Configuration for KubeStellar Console
 *
 * This configuration sets up unit testing with Vitest, React Testing Library,
 * and coverage reporting using the V8 coverage provider.
 */

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vitest.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Environment for running tests
    environment: 'jsdom',

    // Glob patterns for test files
    include: ['src/**/*.{test,spec}.{ts,tsx}'],

    // Exclude patterns
    exclude: [
      'node_modules/',
      'dist/',
      '.git/',
      'coverage/',
    ],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/**/*.stories.tsx',
        'src/**/*.mock.ts',
        'src/mocks/',
        'src/locales/',
        'src/types/',
        'src/config/',
      ],
      include: ['src/components/**/*.{ts,tsx}'],
    },

    // Global test timeout
    timeout: 10000,

    // Setup files
    setupFiles: ['./src/test/setup.ts'],

    // Pool configuration for parallel execution
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },

    // Reporter configuration
    reporters: ['default'],
  },

  // Resolve aliases for cleaner imports
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@components': resolve(__dirname, './src/components'),
      '@hooks': resolve(__dirname, './src/hooks'),
      '@contexts': resolve(__dirname, './src/contexts'),
      '@lib': resolve(__dirname, './src/lib'),
      '@config': resolve(__dirname, './src/config'),
    },
  },
});
