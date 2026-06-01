import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import viteConfig from '../../vite.config'

type ViteConfigFactory = (env: {
  command: 'serve' | 'build'
  mode: string
  isSsrBuild?: boolean
  isPreview?: boolean
}) => Awaited<ReturnType<typeof viteConfig>>

const EXPECTED_THRESHOLD_DIRECTORIES = ['hooks', 'services'] as const
const COVERAGE_INCLUDE_PATTERNS = ['src/hooks/**', 'src/lib/**'] as const
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const SRC_ROOT = path.resolve(TEST_DIR, '..')

async function resolveViteConfig() {
  return typeof viteConfig === 'function'
    ? await (viteConfig as ViteConfigFactory)({ command: 'build', mode: 'test', isSsrBuild: false, isPreview: false })
    : viteConfig
}

function countFilesRecursively(directory: string): number {
  return fs.readdirSync(directory, { withFileTypes: true }).reduce((count, entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      return count + countFilesRecursively(entryPath)
    }
    return count + 1
  }, 0)
}

describe('coverage thresholds configuration', () => {
  it('keeps coverage include rules while thresholds stay disabled for sharded runs', async () => {
    const resolvedConfig = await resolveViteConfig()
    const coverage = resolvedConfig.test?.coverage

    expect(coverage).toBeDefined()
    expect(coverage?.thresholds).toBeUndefined()
    expect(coverage?.include).toEqual(expect.arrayContaining([...COVERAGE_INCLUDE_PATTERNS]))
  })

  it('points each threshold rule at a real source directory with files', () => {
    for (const directoryName of EXPECTED_THRESHOLD_DIRECTORIES) {
      const directoryPath = path.join(SRC_ROOT, directoryName)

      expect(fs.existsSync(directoryPath), `${directoryName} should exist under src/`).toBe(true)
      expect(fs.statSync(directoryPath).isDirectory(), `${directoryName} should be a directory`).toBe(true)
      expect(countFilesRecursively(directoryPath)).toBeGreaterThan(0)
    }
  })
})
