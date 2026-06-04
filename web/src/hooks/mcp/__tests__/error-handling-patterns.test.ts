import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Verifies error handling patterns introduced in #17062:
 * 1. kagenti.ts uses console.error (upgraded from console.warn) for fetch failures
 * 2. MCP hooks document that errors propagate via hook state (not silently swallowed)
 * 3. Optional-data hooks (Kyverno, Trestle, etc.) document intentional fallback patterns
 */

const hooksDir = join(__dirname, '..')
const hooksRoot = join(__dirname, '..', '..')

describe('kagenti error logging level', () => {
  it('uses console.error (not console.warn) for fetch failures', () => {
    const content = readFileSync(join(hooksDir, 'kagenti.ts'), 'utf-8')
    const fetchFailedLines = content
      .split('\n')
      .filter(line => line.includes('[kagenti] fetch failed'))

    expect(fetchFailedLines.length).toBeGreaterThan(0)
    for (const line of fetchFailedLines) {
      expect(line).toContain('console.error')
      expect(line).not.toContain('console.warn')
    }
  })
})

describe('MCP hooks error propagation documentation', () => {
  const hookFiles = ['config.ts', 'networking.ts', 'storage.ts']

  for (const file of hookFiles) {
    it(`${file} documents error propagation via hook state`, () => {
      const content = readFileSync(join(hooksDir, file), 'utf-8')
      // Each backend catch block should document that errors propagate via state
      const catchBlocks = content
        .split('\n')
        .filter(line => line.includes('Error propagated via hook'))

      expect(catchBlocks.length).toBeGreaterThan(0)
    })
  }
})

describe('intentional catch-and-fallback patterns are documented', () => {
  const optionalDataHooks = [
    { file: 'useKyverno.ts', tag: 'intentional' },
    { file: 'useTrestle.ts', tag: 'intentional' },
    { file: 'useKubescape.ts', tag: 'intentional' },
    { file: 'useCachedLLMd.ts', tag: 'intentional' },
    { file: 'useTokenUsage.ts', tag: 'intentional' },
  ]

  for (const { file, tag } of optionalDataHooks) {
    it(`${file} documents ${tag} fallback in catch blocks`, () => {
      const content = readFileSync(join(hooksRoot, file), 'utf-8')
      const intentionalComments = content
        .split('\n')
        .filter(line => line.toLowerCase().includes(tag))

      expect(intentionalComments.length).toBeGreaterThan(0)
    })
  }
})
