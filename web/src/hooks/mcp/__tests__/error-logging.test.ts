import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * Verify that MCP hooks use console.error (not console.warn) for backend fetch failures.
 * This ensures errors are properly categorized for observability tooling.
 */

const hooksDir = join(__dirname, '..')

/**
 * Read a hook file's content, expanding barrel re-exports to include subdirectory files.
 * When a .ts file is a barrel (contains `export * from`), also read all .ts files
 * in the matching subdirectory so pattern checks work after the split refactor.
 */
function readHookContent(file: string): string {
  const filePath = join(hooksDir, file)
  const content = readFileSync(filePath, 'utf-8')
  if (content.includes("export * from './")) {
    const subDir = join(hooksDir, file.replace(/\.ts$/, ''))
    if (existsSync(subDir)) {
      const subFiles = readdirSync(subDir).filter(f => f.endsWith('.ts'))
      return content + subFiles.map(f => readFileSync(join(subDir, f), 'utf-8')).join('\n')
    }
  }
  return content
}

describe('MCP hooks error logging', () => {
  const files = ['networking.ts', 'config.ts', 'storage.ts', 'useClusterResourceQuery.ts']

  for (const file of files) {
    it(`${file} uses console.error for backend fetch failures`, () => {
      const content = readHookContent(file)
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
