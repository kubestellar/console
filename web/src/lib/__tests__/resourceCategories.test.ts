import { describe, it, expect } from 'vitest'
import {
  DEP_CATEGORIES,
  KIND_ICONS,
  getCategoryForKind,
  getIconForKind,
  KNOWN_DEPENDENCY_KINDS,
} from '../resourceCategories'

describe('DEP_CATEGORIES', () => {
  it('is a non-empty array', () => {
    expect(DEP_CATEGORIES.length).toBeGreaterThan(0)
  })

  it('each category has label, kinds, icon, and category', () => {
    for (const cat of DEP_CATEGORIES) {
      expect(cat.label).toBeTruthy()
      expect(cat.kinds.length).toBeGreaterThan(0)
      expect(cat.icon).toBeDefined()
      expect(cat.category).toBeTruthy()
    }
  })
})

describe('KIND_ICONS', () => {
  it('has icons for common Kubernetes kinds', () => {
    expect(KIND_ICONS['ServiceAccount']).toBeDefined()
    expect(KIND_ICONS['ConfigMap']).toBeDefined()
    expect(KIND_ICONS['Secret']).toBeDefined()
    expect(KIND_ICONS['Service']).toBeDefined()
    expect(KIND_ICONS['Ingress']).toBeDefined()
  })
})

describe('getCategoryForKind', () => {
  it('returns correct category for known kinds', () => {
    expect(getCategoryForKind('ServiceAccount')).toBe('rbac')
    expect(getCategoryForKind('ConfigMap')).toBe('config')
    expect(getCategoryForKind('Service')).toBe('networking')
    expect(getCategoryForKind('PersistentVolumeClaim')).toBe('storage')
    expect(getCategoryForKind('HorizontalPodAutoscaler')).toBe('scaling')
  })

  it('returns other for unknown kinds', () => {
    expect(getCategoryForKind('UnknownKind')).toBe('other')
  })
})

describe('getIconForKind', () => {
  it('returns icon for known kinds', () => {
    expect(getIconForKind('ConfigMap')).toBeDefined()
    expect(getIconForKind('Service')).toBeDefined()
  })

  it('returns default icon for unknown kinds', () => {
    const icon = getIconForKind('SomethingUnknown')
    expect(icon).toBeDefined() // Falls back to FileText
  })
})

describe('KNOWN_DEPENDENCY_KINDS', () => {
  it('is a Set of strings', () => {
    expect(KNOWN_DEPENDENCY_KINDS).toBeInstanceOf(Set)
    expect(KNOWN_DEPENDENCY_KINDS.size).toBeGreaterThan(0)
  })

  it('contains expected kinds', () => {
    expect(KNOWN_DEPENDENCY_KINDS.has('ConfigMap')).toBe(true)
    expect(KNOWN_DEPENDENCY_KINDS.has('Secret')).toBe(true)
    expect(KNOWN_DEPENDENCY_KINDS.has('Service')).toBe(true)
  })
})
