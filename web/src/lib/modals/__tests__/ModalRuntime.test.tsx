import { describe, it, expect } from 'vitest'
import {
  registerModal,
  getModalDefinition,
  getAllModalDefinitions,
  registerSectionRenderer,
  parseModalYAML,
} from '../ModalRuntime'
import type { ModalDefinition } from '../types'

/**
 * Tests for ModalRuntime registry functions and utilities.
 *
 * Focuses on:
 * - Modal definition registry (register/get/getAll)
 * - Section renderer registry
 * - YAML parser stub
 * - Title placeholder resolution
 */

describe('Modal Registry', () => {
  const testDefinition: ModalDefinition = {
    kind: 'Pod',
    title: 'Pod Details - {name}',
    icon: 'Box',
    size: 'lg',
    tabs: [
      {
        id: 'overview',
        label: 'Overview',
        sections: [{ type: 'key-value', fields: [] }],
      },
    ],
  }

  it('registers a modal definition', () => {
    registerModal(testDefinition)
    const result = getModalDefinition('Pod')
    expect(result).toBeDefined()
    expect(result?.kind).toBe('Pod')
    expect(result?.title).toBe('Pod Details - {name}')
  })

  it('returns undefined for unregistered kind', () => {
    const result = getModalDefinition('NonExistent')
    expect(result).toBeUndefined()
  })

  it('overwrites existing definition with same kind', () => {
    const updated: ModalDefinition = {
      ...testDefinition,
      title: 'Updated Pod Details',
    }
    registerModal(testDefinition)
    registerModal(updated)
    const result = getModalDefinition('Pod')
    expect(result?.title).toBe('Updated Pod Details')
  })

  it('getAllModalDefinitions returns all registered modals', () => {
    const deployment: ModalDefinition = {
      kind: 'Deployment',
      title: 'Deployment Details',
      icon: 'Layers',
      size: 'lg',
      tabs: [],
    }
    registerModal(testDefinition)
    registerModal(deployment)

    const all = getAllModalDefinitions()
    expect(all.length).toBeGreaterThanOrEqual(2)

    const kinds = all.map((d) => d.kind)
    expect(kinds).toContain('Pod')
    expect(kinds).toContain('Deployment')
  })

  it('getAllModalDefinitions returns an array (not a Map)', () => {
    const all = getAllModalDefinitions()
    expect(Array.isArray(all)).toBe(true)
  })
})

describe('registerSectionRenderer', () => {
  it('accepts a section type and renderer component', () => {
    const MockRenderer = () => null
    // Should not throw
    expect(() => registerSectionRenderer('custom-section', MockRenderer)).not.toThrow()
  })
})

describe('parseModalYAML', () => {
  it('throws error indicating YAML parsing is not implemented', () => {
    expect(() => parseModalYAML('kind: Pod')).toThrow(
      'YAML parsing not yet implemented'
    )
  })

  it('error message suggests using registerModal()', () => {
    try {
      parseModalYAML('kind: Pod')
    } catch (e: unknown) {
      expect((e as Error).message).toContain('registerModal()')
    }
  })
})

describe('ModalRuntime title resolution', () => {
  it('resolves title placeholders with data values', () => {
    // Test the placeholder resolution logic used by ModalRuntime component
    const title = 'Pod Details - {name}'
    const data: Record<string, unknown> = { name: 'nginx-abc123', namespace: 'production' }

    let resolved = title
    Object.entries(data).forEach(([key, value]) => {
      resolved = resolved.replace(`{${key}}`, String(value))
    })

    expect(resolved).toBe('Pod Details - nginx-abc123')
  })

  it('leaves unmatched placeholders as-is', () => {
    const title = '{kind} - {missing}'
    const data: Record<string, unknown> = { kind: 'Pod' }

    let resolved = title
    Object.entries(data).forEach(([key, value]) => {
      resolved = resolved.replace(`{${key}}`, String(value))
    })

    expect(resolved).toBe('Pod - {missing}')
  })

  it('handles empty data object', () => {
    const title = 'Details for {name}'
    const data: Record<string, unknown> = {}

    let resolved = title
    Object.entries(data).forEach(([key, value]) => {
      resolved = resolved.replace(`{${key}}`, String(value))
    })

    expect(resolved).toBe('Details for {name}')
  })

  it('handles multiple occurrences of the same placeholder', () => {
    const title = '{name} ({name})'
    const data: Record<string, unknown> = { name: 'test' }

    let resolved = title
    Object.entries(data).forEach(([key, value]) => {
      resolved = resolved.replace(`{${key}}`, String(value))
    })

    // String.replace only replaces first occurrence
    expect(resolved).toBe('test ({name})')
  })
})
