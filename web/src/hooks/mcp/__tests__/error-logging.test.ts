import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, extname } from 'path'

/**
 * Verify that MCP hooks use console.error (not console.warn) for backend fetch failures.
 * This ensures errors are properly categorized for observability tooling.
 */

/**
 * Some hook modules (e.g. storage.ts, helm.ts) were split into a directory of
 * smaller files with the original filename kept as a backward-compatible
 * barrel re-export (see Issue #23155). For those, concatenate the barrel with
 * the contents of its sibling directory so pattern checks still see the code.
 */
function readModuleSource(hooksDir: string, file: string): string {
  const barrelContent = readFileSync(join(hooksDir, file), 'utf-8')
  const moduleDir = join(hooksDir, file.replace(extname(file), ''))

  if (!existsSync(moduleDir)) {
    return barrelContent
  }

  const splitContent = readdirSync(moduleDir)
    .filter(entry => entry.endsWith('.ts') || entry.endsWith('.tsx'))
    .map(entry => readFileSync(join(moduleDir, entry), 'utf-8'))
    .join('\n')

  return `${barrelContent}\n${splitContent}`
}

describe('MCP hooks error logging', () => {
  const hooksDir = join(__dirname, '..')
  const files = ['networking.ts', 'config.ts', 'storage.ts', 'useClusterResourceQuery.ts']

  for (const file of files) {
    it(`${file} uses console.error for backend fetch failures`, () => {
      const content = readModuleSource(hooksDir, file)
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
