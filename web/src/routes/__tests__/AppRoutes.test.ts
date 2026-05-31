/**
 * AppRoutes Structure Tests
 *
 * Validates that AppRoutes.tsx has correct structure:
 * - LightweightShell wraps providers in proper nesting order
 * - Catch-all routes exist for unknown paths (prevents blank pages)
 * - All LightweightShell routes reference valid route constants
 *
 * Run:   npx vitest run src/routes/__tests__/AppRoutes.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const APP_ROUTES_FILE = resolve(SRC_DIR, 'routes', 'AppRoutes.tsx')

function readAppRoutes(): string {
  return readFileSync(APP_ROUTES_FILE, 'utf-8')
}

describe('LightweightShell', () => {
  it('wraps children in BrandingProvider > ThemeProvider > AppErrorBoundary > ChunkErrorBoundary > PageErrorBoundary > Suspense', () => {
    const content = readAppRoutes()

    // Extract the LightweightShell function body
    const shellMatch = content.match(
      /function LightweightShell\(\{[^}]*\}[^{]*\{([\s\S]*?)^\}/m
    )
    expect(shellMatch).not.toBeNull()
    const shellBody = shellMatch![1]

    // Verify correct nesting order (each provider appears before the next)
    const providers = [
      'BrandingProvider',
      'ThemeProvider',
      'AppErrorBoundary',
      'ChunkErrorBoundary',
      'PageErrorBoundary',
      'Suspense',
    ]

    let lastIndex = -1
    for (const provider of providers) {
      const idx = shellBody.indexOf(`<${provider}`)
      expect(idx, `${provider} should be present in LightweightShell`).toBeGreaterThan(-1)
      expect(idx, `${provider} should appear after previous provider`).toBeGreaterThan(lastIndex)
      lastIndex = idx
    }
  })

  it('renders {children} inside Suspense', () => {
    const content = readAppRoutes()
    const shellMatch = content.match(
      /function LightweightShell\(\{[^}]*\}[^{]*\{([\s\S]*?)^\}/m
    )
    expect(shellMatch).not.toBeNull()
    const shellBody = shellMatch![1]

    const suspenseIdx = shellBody.indexOf('<Suspense')
    const childrenIdx = shellBody.indexOf('{children}')
    expect(childrenIdx).toBeGreaterThan(suspenseIdx)
  })
})

describe('Catch-all routes', () => {
  it('has a catch-all route with path="*" inside FullDashboardApp', () => {
    const content = readAppRoutes()

    // The fix adds: <Route path="*" element={<SuspenseRoute><NotFound /></SuspenseRoute>} />
    // inside FullDashboardApp's route tree
    const catchAllPattern = /Route\s+path="\*"\s+element=\{<SuspenseRoute><NotFound\s*\/><\/SuspenseRoute>\}/
    const matches = content.match(new RegExp(catchAllPattern, 'g'))

    // Should have at least 2 catch-all routes (one in main layout, one top-level)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBeGreaterThanOrEqual(2)
  })

  it('catch-all route references NotFound component', () => {
    const content = readAppRoutes()

    // NotFound must be imported
    expect(content).toContain('NotFound')

    // The route must render NotFound wrapped in SuspenseRoute
    expect(content).toMatch(/path="\*"[\s\S]*?NotFound/)
  })
})

describe('LightweightShell routes', () => {
  it('all LightweightShell routes wrap a component', () => {
    const content = readAppRoutes()

    // Find all lines with <LightweightShell>
    const shellRoutePattern = /<LightweightShell><(\w+)\s*\/><\/LightweightShell>/g
    const matches = [...content.matchAll(shellRoutePattern)]

    // Should have multiple lightweight routes
    const MIN_LIGHTWEIGHT_ROUTES = 5
    expect(matches.length).toBeGreaterThanOrEqual(MIN_LIGHTWEIGHT_ROUTES)

    // Each should wrap exactly one component
    for (const match of matches) {
      expect(match[1]).toBeTruthy()
      expect(match[1][0]).toBe(match[1][0].toUpperCase()) // PascalCase component
    }
  })
})
