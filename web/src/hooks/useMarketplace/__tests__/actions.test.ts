import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock dependencies before importing module under test
vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../../../lib/themes', () => ({
  addCustomTheme: vi.fn(),
  removeCustomTheme: vi.fn(),
}))

vi.mock('../../../lib/analytics', () => ({
  emitMarketplaceInstall: vi.fn(),
  emitMarketplaceRemove: vi.fn(),
  emitMarketplaceInstallFailed: vi.fn(),
}))

vi.mock('../../../components/cards/cardRegistry', () => ({
  isCardTypeRegistered: vi.fn(() => false),
}))

vi.mock('../../../components/dashboard/dashboardUtils', () => ({
  getDefaultCardSize: vi.fn(() => ({ w: 4, h: 3 })),
}))

vi.mock('../integrity', () => ({
  verifyIntegrity: vi.fn(async () => undefined),
  IntegrityError: class IntegrityError extends Error {
    constructor(msg: string) { super(msg); this.name = 'IntegrityError' }
  },
  MissingIntegrityError: class MissingIntegrityError extends Error {
    constructor() { super('missing integrity hash'); this.name = 'MissingIntegrityError' }
  },
}))

import { mergeRegistryItems, useMarketplaceActions, useInstalledMarketplaceItems } from '../actions'
import { isCardTypeRegistered } from '../../../components/cards/cardRegistry'
import { emitMarketplaceInstallFailed, emitMarketplaceInstall, emitMarketplaceRemove } from '../../../lib/analytics'
import { api } from '../../../lib/api'
import { addCustomTheme, removeCustomTheme } from '../../../lib/themes'
import { verifyIntegrity } from '../integrity'
import type { MarketplaceItem, MarketplaceRegistry, InstalledMap } from '../types'

function makeItem(overrides: Partial<MarketplaceItem> = {}): MarketplaceItem {
  return {
    id: 'test-item',
    name: 'Test Item',
    description: 'A test item',
    author: 'test',
    version: '1.0.0',
    downloadUrl: 'https://raw.githubusercontent.com/kubestellar/marketplace/main/item.json',
    sha256: 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
    tags: [],
    cardCount: 1,
    type: 'dashboard',
    ...overrides,
  }
}

// ── mergeRegistryItems ──────────────────────────────────────────

describe('mergeRegistryItems', () => {
  beforeEach(() => {
    vi.mocked(isCardTypeRegistered).mockReturnValue(false)
  })

  it('returns empty array for empty registry', () => {
    const registry: MarketplaceRegistry = { version: '1', updatedAt: '2024-01-01', items: [] }
    expect(mergeRegistryItems(registry)).toEqual([])
  })

  it('passes through items that are not help-wanted', () => {
    const item = makeItem({ status: 'available' })
    const registry: MarketplaceRegistry = { version: '1', updatedAt: '2024-01-01', items: [item] }
    const result = mergeRegistryItems(registry)
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('available')
  })

  it('merges items and presets together', () => {
    const item = makeItem({ id: 'item-1' })
    const preset = makeItem({ id: 'preset-1', type: 'card-preset' })
    const registry: MarketplaceRegistry = {
      version: '1', updatedAt: '2024-01-01', items: [item], presets: [preset],
    }
    const result = mergeRegistryItems(registry)
    expect(result).toHaveLength(2)
    expect(result.map(r => r.id)).toEqual(['item-1', 'preset-1'])
  })

  it('handles undefined presets gracefully', () => {
    const item = makeItem()
    const registry: MarketplaceRegistry = { version: '1', updatedAt: '2024-01-01', items: [item] }
    const result = mergeRegistryItems(registry)
    expect(result).toHaveLength(1)
  })

  it('reconciles help-wanted item to available when card type is registered', () => {
    vi.mocked(isCardTypeRegistered).mockReturnValue(true)
    const item = makeItem({
      id: 'cncf-karmada',
      status: 'help-wanted',
      tags: ['help-wanted', 'cncf'],
    })
    const registry: MarketplaceRegistry = { version: '1', updatedAt: '2024-01-01', items: [item] }
    const result = mergeRegistryItems(registry)
    expect(result[0].status).toBe('available')
    expect(result[0].tags).not.toContain('help-wanted')
    expect(result[0].tags).toContain('cncf')
  })

  it('does not reconcile help-wanted item when card type is NOT registered', () => {
    vi.mocked(isCardTypeRegistered).mockReturnValue(false)
    const item = makeItem({
      id: 'cncf-karmada',
      status: 'help-wanted',
      tags: ['help-wanted'],
    })
    const registry: MarketplaceRegistry = { version: '1', updatedAt: '2024-01-01', items: [item] }
    const result = mergeRegistryItems(registry)
    expect(result[0].status).toBe('help-wanted')
    expect(result[0].tags).toContain('help-wanted')
  })

  it('does not reconcile item whose id has no mapping in MARKETPLACE_TO_CARD_TYPE', () => {
    vi.mocked(isCardTypeRegistered).mockReturnValue(true)
    const item = makeItem({
      id: 'unknown-no-mapping',
      status: 'help-wanted',
      tags: ['help-wanted'],
    })
    const registry: MarketplaceRegistry = { version: '1', updatedAt: '2024-01-01', items: [item] }
    const result = mergeRegistryItems(registry)
    expect(result[0].status).toBe('help-wanted')
  })

  it('handles empty items array with presets', () => {
    const preset = makeItem({ id: 'p1', type: 'card-preset' })
    const registry: MarketplaceRegistry = {
      version: '1', updatedAt: '2024-01-01', items: [], presets: [preset],
    }
    expect(mergeRegistryItems(registry)).toHaveLength(1)
  })
})

// ── assertTrustedMarketplaceDownloadUrl (via useMarketplaceActions) ──

describe('marketplace download URL validation (security)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('rejects non-URL string', async () => {
    const { result } = renderHook(() => useMarketplaceActions({}))
    const item = makeItem({ downloadUrl: 'not-a-url' })

    await expect(result.current.installItem(item)).rejects.toThrow('not allowed')
    expect(emitMarketplaceInstallFailed).toHaveBeenCalledWith(
      'dashboard', 'Test Item', expect.stringContaining('not allowed'), 'download'
    )
  })

  it('rejects URL with untrusted origin', async () => {
    const { result } = renderHook(() => useMarketplaceActions({}))
    const item = makeItem({ downloadUrl: 'https://evil.com/kubestellar/payload.json' })

    await expect(result.current.installItem(item)).rejects.toThrow('not allowed')
  })

  it('rejects github.com URL without /kubestellar/ pathname prefix', async () => {
    const { result } = renderHook(() => useMarketplaceActions({}))
    const item = makeItem({ downloadUrl: 'https://github.com/attacker/malicious/raw/main/card.json' })

    await expect(result.current.installItem(item)).rejects.toThrow('not allowed')
  })

  it('rejects raw.githubusercontent.com URL without /kubestellar/ prefix', async () => {
    const { result } = renderHook(() => useMarketplaceActions({}))
    const item = makeItem({ downloadUrl: 'https://raw.githubusercontent.com/other-org/repo/main/x.json' })

    await expect(result.current.installItem(item)).rejects.toThrow('not allowed')
  })

  it('rejects javascript: protocol URL', async () => {
    const { result } = renderHook(() => useMarketplaceActions({}))
    const item = makeItem({ downloadUrl: 'javascript:alert(1)' })

    await expect(result.current.installItem(item)).rejects.toThrow('not allowed')
  })

  it('rejects data: protocol URL', async () => {
    const { result } = renderHook(() => useMarketplaceActions({}))
    const item = makeItem({ downloadUrl: 'data:text/html,<script>alert(1)</script>' })

    await expect(result.current.installItem(item)).rejects.toThrow('not allowed')
  })

  it('rejects file: protocol URL', async () => {
    const { result } = renderHook(() => useMarketplaceActions({}))
    const item = makeItem({ downloadUrl: 'file:///etc/passwd' })

    await expect(result.current.installItem(item)).rejects.toThrow('not allowed')
  })

  it('accepts valid raw.githubusercontent.com/kubestellar/ URL', async () => {
    const { result } = renderHook(() => useMarketplaceActions({}))
    const item = makeItem({
      downloadUrl: 'https://raw.githubusercontent.com/kubestellar/marketplace/main/dashboards/test.json',
      sha256: 'a'.repeat(64),
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{"cards":[]}'),
    })
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'dash-1' } })

    await act(async () => {
      await result.current.installItem(item)
    })

    expect(emitMarketplaceInstall).toHaveBeenCalledWith('dashboard', 'Test Item')
  })

  it('accepts valid github.com/kubestellar/ URL', async () => {
    const { result } = renderHook(() => useMarketplaceActions({}))
    const item = makeItem({
      downloadUrl: 'https://github.com/kubestellar/console-marketplace/raw/main/card.json',
      sha256: 'b'.repeat(64),
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{"cards":[]}'),
    })
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'dash-2' } })

    await act(async () => {
      await result.current.installItem(item)
    })

    expect(emitMarketplaceInstall).toHaveBeenCalled()
  })

  it('rejects empty sha256', async () => {
    const { result } = renderHook(() => useMarketplaceActions({}))
    const item = makeItem({ sha256: '' })

    await expect(result.current.installItem(item)).rejects.toThrow('missing integrity')
    expect(emitMarketplaceInstallFailed).toHaveBeenCalledWith(
      'dashboard', 'Test Item', expect.stringContaining('integrity'), 'integrity'
    )
  })

  it('rejects whitespace-only sha256', async () => {
    const { result } = renderHook(() => useMarketplaceActions({}))
    const item = makeItem({ sha256: '   ' })

    await expect(result.current.installItem(item)).rejects.toThrow('missing integrity')
  })
})

// ── installItem flow tests ──────────────────────────────────────

describe('useMarketplaceActions.installItem', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(verifyIntegrity).mockResolvedValue(undefined)
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('handles fetch network error', async () => {
    const { result } = renderHook(() => useMarketplaceActions({}))
    const item = makeItem({ sha256: 'c'.repeat(64) })

    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(result.current.installItem(item)).rejects.toThrow('Failed to fetch')
    expect(emitMarketplaceInstallFailed).toHaveBeenCalledWith(
      'dashboard', 'Test Item', 'Failed to fetch', 'download'
    )
  })

  it('handles HTTP error response', async () => {
    const { result } = renderHook(() => useMarketplaceActions({}))
    const item = makeItem({ sha256: 'd'.repeat(64) })

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 })

    await expect(result.current.installItem(item)).rejects.toThrow('Download failed: 403')
    expect(emitMarketplaceInstallFailed).toHaveBeenCalledWith(
      'dashboard', 'Test Item', 'HTTP 403', 'http_error'
    )
  })

  it('installs card-preset type correctly', async () => {
    const { result } = renderHook(() => useMarketplaceActions({}))
    const item = makeItem({
      type: 'card-preset',
      sha256: 'e'.repeat(64),
    })

    const presetJson = JSON.stringify({ card_type: 'pod_issues', config: { ns: 'default' }, title: 'Pods' })
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(presetJson) })
    vi.mocked(api.get).mockResolvedValue({ data: [{ id: 'dash-main', is_default: true }] })
    vi.mocked(api.post).mockResolvedValue({ data: {} })

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    let installResult: unknown
    await act(async () => {
      installResult = await result.current.installItem(item)
    })

    expect(installResult).toEqual({ type: 'card-preset', data: JSON.parse(presetJson) })
    expect(api.post).toHaveBeenCalledWith('/api/dashboards/dash-main/cards', expect.objectContaining({ card_type: 'pod_issues' }))
    expect(dispatchSpy).toHaveBeenCalled()
  })

  it('rejects card-preset with missing card_type', async () => {
    const { result } = renderHook(() => useMarketplaceActions({}))
    const item = makeItem({ type: 'card-preset', sha256: 'f'.repeat(64) })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, text: () => Promise.resolve('{"config":{}}'),
    })

    await expect(result.current.installItem(item)).rejects.toThrow('missing card_type')
    expect(emitMarketplaceInstallFailed).toHaveBeenCalledWith(
      'card-preset', 'Test Item', expect.stringContaining('card_type'), 'parse'
    )
  })

  it('installs theme type correctly', async () => {
    const { result } = renderHook(() => useMarketplaceActions({}))
    const item = makeItem({ type: 'theme', sha256: 'a1'.repeat(32) })

    const themeJson = JSON.stringify({ name: 'dark-neon', colors: {} })
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(themeJson) })

    let installResult: unknown
    await act(async () => {
      installResult = await result.current.installItem(item)
    })

    expect(installResult).toEqual({ type: 'theme', data: JSON.parse(themeJson) })
    expect(addCustomTheme).toHaveBeenCalledWith(JSON.parse(themeJson))
  })

  it('installs dashboard type correctly', async () => {
    const { result } = renderHook(() => useMarketplaceActions({}))
    const item = makeItem({ sha256: 'b1'.repeat(32) })

    const dashJson = JSON.stringify({ cards: [], name: 'My Dash' })
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(dashJson) })
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'new-dash-id' } })

    let installResult: unknown
    await act(async () => {
      installResult = await result.current.installItem(item)
    })

    expect(installResult).toEqual({ type: 'dashboard', data: { id: 'new-dash-id' } })
    expect(api.post).toHaveBeenCalledWith('/api/dashboards/import', JSON.parse(dashJson))
  })
})

// ── useMarketplaceActions.removeItem ────────────────────────────

describe('useMarketplaceActions.removeItem', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('does nothing when item is not installed', async () => {
    const { result } = renderHook(() => useMarketplaceActions({}))
    const item = makeItem()

    await act(async () => {
      await result.current.removeItem(item)
    })

    expect(api.delete).not.toHaveBeenCalled()
    expect(emitMarketplaceRemove).not.toHaveBeenCalled()
  })

  it('removes dashboard and calls api.delete', async () => {
    const installed: InstalledMap = {
      'test-item': { dashboardId: 'dash-99', installedAt: '2024-01-01', type: 'dashboard' },
    }
    const { result } = renderHook(() => useMarketplaceActions(installed))
    vi.mocked(api.delete).mockResolvedValue({ data: {} })

    await act(async () => {
      await result.current.removeItem(makeItem())
    })

    expect(api.delete).toHaveBeenCalledWith('/api/dashboards/dash-99')
    expect(emitMarketplaceRemove).toHaveBeenCalledWith('dashboard')
  })

  it('ignores 404 when removing dashboard that was already deleted', async () => {
    const installed: InstalledMap = {
      'test-item': { dashboardId: 'dash-gone', installedAt: '2024-01-01', type: 'dashboard' },
    }
    const { result } = renderHook(() => useMarketplaceActions(installed))
    vi.mocked(api.delete).mockRejectedValue(new Error('Request failed with status 404'))

    await act(async () => {
      await result.current.removeItem(makeItem())
    })

    expect(emitMarketplaceRemove).toHaveBeenCalled()
  })

  it('removes theme and calls removeCustomTheme', async () => {
    const installed: InstalledMap = {
      'test-item': { installedAt: '2024-01-01', type: 'theme' },
    }
    const { result } = renderHook(() => useMarketplaceActions(installed))

    await act(async () => {
      await result.current.removeItem(makeItem({ type: 'theme' }))
    })

    expect(removeCustomTheme).toHaveBeenCalledWith('test-item')
    expect(emitMarketplaceRemove).toHaveBeenCalledWith('theme')
  })
})

// ── useInstalledMarketplaceItems ────────────────────────────────

describe('useInstalledMarketplaceItems', () => {
  const notifyInstalledStorageChanged = () => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'kc-marketplace-installed' }))
  }

  beforeEach(() => {
    localStorage.clear()
    notifyInstalledStorageChanged()
  })

  afterEach(() => {
    localStorage.clear()
    notifyInstalledStorageChanged()
  })

  it('returns empty object when nothing installed', () => {
    const { result } = renderHook(() => useInstalledMarketplaceItems())
    expect(result.current).toEqual({})
  })

  it('reads from localStorage', () => {
    localStorage.setItem('kc-marketplace-installed', JSON.stringify({
      'my-dash': { dashboardId: 'd1', installedAt: '2024-01-01', type: 'dashboard' },
    }))
    notifyInstalledStorageChanged()
    const { result } = renderHook(() => useInstalledMarketplaceItems())
    expect(result.current).toBeDefined()
  })
})

// ── isInstalled helper ──────────────────────────────────────────

describe('useMarketplaceActions.isInstalled', () => {
  it('returns true for installed item', () => {
    const installed: InstalledMap = {
      'my-item': { installedAt: '2024-01-01', type: 'dashboard' },
    }
    const { result } = renderHook(() => useMarketplaceActions(installed))
    expect(result.current.isInstalled('my-item')).toBe(true)
  })

  it('returns false for non-installed item', () => {
    const { result } = renderHook(() => useMarketplaceActions({}))
    expect(result.current.isInstalled('not-here')).toBe(false)
  })
})

// ── getInstalledDashboardId helper ──────────────────────────────

describe('useMarketplaceActions.getInstalledDashboardId', () => {
  it('returns dashboardId for installed dashboard', () => {
    const installed: InstalledMap = {
      'dash-item': { dashboardId: 'abc-123', installedAt: '2024-01-01', type: 'dashboard' },
    }
    const { result } = renderHook(() => useMarketplaceActions(installed))
    expect(result.current.getInstalledDashboardId('dash-item')).toBe('abc-123')
  })

  it('returns undefined for non-installed item', () => {
    const { result } = renderHook(() => useMarketplaceActions({}))
    expect(result.current.getInstalledDashboardId('nope')).toBeUndefined()
  })
})
