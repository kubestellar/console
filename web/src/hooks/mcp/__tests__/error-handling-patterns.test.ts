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
  interface DocumentedFallbackPattern {
    file: string
    documentation: RegExp[]
    fallback: RegExp[]
  }

  const optionalDataHooks: DocumentedFallbackPattern[] = [
    {
      file: 'useKyverno.ts',
      documentation: [/fall back to default/i],
      fallback: [/return emptyStatus\(\s*cluster,\s*false/i, /return emptyStatus\(\s*cluster,\s*true,/i],
    },
    {
      file: 'useTrestle.ts',
      documentation: [/fall back to default/i, /JSON parse error, try next API group/i],
      fallback: [/return emptyStatus\(\s*cluster,\s*false/i, /return emptyStatus\(\s*cluster,\s*true\)/i],
    },
    {
      file: 'useKubescape.ts',
      documentation: [/fall back to default/i],
      fallback: [/return emptyStatus\(\s*cluster,\s*false/i, /return emptyStatus\(\s*cluster,\s*true,/i],
    },
    {
      file: 'useCachedLLMd.ts',
      documentation: [/Suppress demo mode errors - they're expected when agent is unavailable/i],
      fallback: [/return \[\]/i],
    },
    {
      file: 'useTokenUsage.ts',
      documentation: [
        /Corrupted settings JSON — fall back to defaults\./i,
        /Ignore invalid data — start from zeroed byCategory\./i,
        /prevent Firefox from firing unhandledrejection/i,
      ],
      fallback: [/response\.json\(\)\.catch\(\(\) => null\)/i, /Failures swallow silently/i],
    },
  ]

  for (const { file, documentation, fallback } of optionalDataHooks) {
    it(`${file} documents its current fallback behavior`, () => {
      const content = readFileSync(join(hooksRoot, file), 'utf-8')

      expect(documentation.some(pattern => pattern.test(content))).toBe(true)
      expect(fallback.some(pattern => pattern.test(content))).toBe(true)
    })
  }
})
