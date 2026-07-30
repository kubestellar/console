/**
 * Tests for navigationIcons.ts
 *
 * Covers the NAVIGATION_ICONS record and getNavigationIcon() fallback logic.
 */
import { describe, it, expect } from 'vitest'

import { NAVIGATION_ICONS, getNavigationIcon } from '../navigationIcons'

// ---------------------------------------------------------------------------
// NAVIGATION_ICONS record
// ---------------------------------------------------------------------------

describe('NAVIGATION_ICONS', () => {
  it('is a non-empty record', () => {
    expect(typeof NAVIGATION_ICONS).toBe('object')
    expect(Object.keys(NAVIGATION_ICONS).length).toBeGreaterThan(0)
  })

  it('all values are non-empty strings', () => {
    for (const [key, value] of Object.entries(NAVIGATION_ICONS)) {
      expect(typeof value, `icon for "${key}" should be a string`).toBe('string')
      expect(value.length, `icon for "${key}" should be non-empty`).toBeGreaterThan(0)
    }
  })

  it('contains primary navigation entries', () => {
    expect(NAVIGATION_ICONS['dashboard']).toBeTruthy()
    expect(NAVIGATION_ICONS['clusters']).toBeTruthy()
    expect(NAVIGATION_ICONS['alerts']).toBeTruthy()
    expect(NAVIGATION_ICONS['settings']).toBeTruthy()
  })

  it('contains all expected primary nav items', () => {
    const primaryIds = [
      'dashboard', 'clusters', 'cluster-admin', 'compliance',
      'enterprise', 'deploy', 'insights', 'ai-ml', 'ai-agents',
      'acmm', 'ci-cd', 'multi-tenancy', 'alerts', 'arcade',
    ]
    for (const id of primaryIds) {
      expect(NAVIGATION_ICONS[id], `missing primary nav icon for "${id}"`).toBeTruthy()
    }
  })

  it('contains discoverable dashboard entries', () => {
    const discoverable = [
      'compute', 'cost', 'deployments', 'events', 'gitops',
      'helm', 'logs', 'network', 'nodes', 'operators', 'pods',
      'security', 'services', 'storage', 'workloads',
    ]
    for (const id of discoverable) {
      expect(NAVIGATION_ICONS[id], `missing discoverable icon for "${id}"`).toBeTruthy()
    }
  })

  it('contains secondary navigation entries', () => {
    const secondary = ['marketplace', 'history', 'namespaces', 'users', 'settings']
    for (const id of secondary) {
      expect(NAVIGATION_ICONS[id], `missing secondary icon for "${id}"`).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// getNavigationIcon
// ---------------------------------------------------------------------------

describe('getNavigationIcon', () => {
  it('returns the icon name for a known primary nav ID', () => {
    expect(getNavigationIcon('dashboard')).toBe('LayoutDashboard')
  })

  it('returns the icon name for clusters', () => {
    expect(getNavigationIcon('clusters')).toBe('Server')
  })

  it('returns the icon name for alerts', () => {
    expect(getNavigationIcon('alerts')).toBe('Bell')
  })

  it('returns the icon name for ai-ml', () => {
    expect(getNavigationIcon('ai-ml')).toBe('Sparkles')
  })

  it('returns the icon name for pods', () => {
    expect(getNavigationIcon('pods')).toBe('Hexagon')
  })

  it('returns the icon name for settings', () => {
    expect(getNavigationIcon('settings')).toBe('Settings')
  })

  it('falls back to LayoutDashboard for unknown IDs', () => {
    expect(getNavigationIcon('unknown-page')).toBe('LayoutDashboard')
    expect(getNavigationIcon('')).toBe('LayoutDashboard')
    expect(getNavigationIcon('does-not-exist')).toBe('LayoutDashboard')
  })

  it('returns LayoutDashboard for IDs similar to but not matching known entries', () => {
    expect(getNavigationIcon('Dashboard')).toBe('LayoutDashboard') // case-sensitive
    expect(getNavigationIcon('CLUSTERS')).toBe('LayoutDashboard') // case-sensitive
  })

  it('returns all icons from NAVIGATION_ICONS correctly', () => {
    for (const [id, expectedIcon] of Object.entries(NAVIGATION_ICONS)) {
      expect(getNavigationIcon(id)).toBe(expectedIcon)
    }
  })
})
