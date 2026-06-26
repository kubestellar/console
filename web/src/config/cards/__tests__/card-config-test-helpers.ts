import { describe, expect, it } from 'vitest'
import type { UnifiedCardConfig } from '../../../lib/unified/types'
import { getCardConfig, hasUnifiedConfig } from '../index'

type ModuleExports = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCardConfigCandidate(value: unknown): value is UnifiedCardConfig {
  if (!isRecord(value)) return false
  return (
    typeof value.type === 'string' &&
    typeof value.title === 'string' &&
    typeof value.category === 'string' &&
    isRecord(value.dataSource) &&
    typeof value.dataSource.type === 'string' &&
    isRecord(value.content) &&
    typeof value.content.type === 'string'
  )
}

function extractCardConfig(moduleExports: ModuleExports): UnifiedCardConfig {
  const uniqueConfigs = new Set<UnifiedCardConfig>()

  Object.values(moduleExports).forEach(value => {
    if (isCardConfigCandidate(value)) {
      uniqueConfigs.add(value)
    }
  })

  const configs = [...uniqueConfigs]
  expect(configs).toHaveLength(1)
  return configs[0]
}

export function registerCardConfigTest(fileName: string, moduleExports: ModuleExports): void {
  describe(`${fileName} card config`, () => {
    it('exports a valid unified card config', () => {
      const config = extractCardConfig(moduleExports)

      expect(config.type).toBeTruthy()
      expect(config.title).toBeTruthy()
      expect(config.category).toBeTruthy()
      expect(config.dataSource.type).toBeTruthy()
      expect(config.content.type).toBeTruthy()

      if (config.defaultWidth !== undefined) {
        expect(config.defaultWidth).toBeGreaterThan(0)
      }

      if (config.defaultHeight !== undefined) {
        expect(config.defaultHeight).toBeGreaterThan(0)
      }

      if (config.description !== undefined) {
        expect(config.description.length).toBeGreaterThan(0)
      }

      if (config.projects !== undefined) {
        expect(Array.isArray(config.projects)).toBe(true)
        config.projects.forEach(project => expect(project.length).toBeGreaterThan(0))
      }

      if (config.emptyState) {
        expect(config.emptyState.title).toBeTruthy()
        expect(config.emptyState.message).toBeTruthy()
      }
    })

    it('is registered under its card type', () => {
      const config = extractCardConfig(moduleExports)

      expect(hasUnifiedConfig(config.type)).toBe(true)
      expect(getCardConfig(config.type)).toBeDefined()
    })

    it('keeps default export aligned when present', () => {
      const config = extractCardConfig(moduleExports)
      const defaultExport = moduleExports.default

      if (isCardConfigCandidate(defaultExport)) {
        expect(defaultExport.type).toBe(config.type)
        expect(defaultExport.title).toBe(config.title)
      }
    })
  })
}
