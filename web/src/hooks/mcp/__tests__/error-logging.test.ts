import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Verify that MCP hooks use console.error (not console.warn) for backend fetch failures.
 * This ensures errors are properly categorized for observability tooling.
 */
describe('MCP hooks error logging', () => {
  const hooksDir = join(__dirname, '..')
  const files = ['networking.ts', 'config.ts', 'storage.ts', 'useClusterResourceQuery.ts']

  for (const file of files) {
    it(`${file} uses console.error for backend fetch failures`, () => {
      const content = readFileSync(join(hooksDir, file), 'utf-8')
      const backendFailLines = content
        .split('\n')
        .filter(line => line.includes('Backend fetch failed'))

      expect(backendFailLines.length).toBeGreaterThan(0)
      for (const line of backendFailLines) {
        expect(line).toContain('console.error')
        expect(line).not.toContain('console.warn')
      }
    })
  }
})
