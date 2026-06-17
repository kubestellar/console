import { describe, setupUseMarketplaceSuite } from './useMarketplace.test.setup'
import { it, expect, renderHook, waitFor, act, useMarketplace, makeItem, seedCache, seedInstalledItems, mockApiPost, mockApiDelete, mockAddCustomTheme, mockRemoveCustomTheme, mockEmitInstall, mockEmitRemove, mockEmitInstallFailed, TRUSTED_DOWNLOAD_URL, UNTRUSTED_DOWNLOAD_URL, DEFAULT_SHA256, computeSha256 } from './useMarketplace.test.setup'

describe('useMarketplace', () => {
  setupUseMarketplaceSuite()

it('installs a dashboard item via API import', async () => {
  const dashJson = { layout: [{ type: 'cluster_health' }] }
  const sha256 = await computeSha256(JSON.stringify(dashJson))
  seedCache([makeItem({ id: 'dash-1', type: 'dashboard', downloadUrl: TRUSTED_DOWNLOAD_URL, sha256 })])

  vi.mocked(globalThis.fetch).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(dashJson),
    text: () => Promise.resolve(JSON.stringify(dashJson)),
  } as Response)
  mockApiPost.mockResolvedValueOnce({ data: { id: 'imported-dash-id' } })

  const { result } = renderHook(() => useMarketplace())
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  let installResult: unknown
  await act(async () => {
    installResult = await result.current.installItem(result.current.allItems[0])
  })

  expect(installResult).toEqual({ type: 'dashboard', data: { id: 'imported-dash-id' } })
  expect(mockApiPost).toHaveBeenCalledWith('/api/dashboards/import', dashJson)
  expect(mockEmitInstall).toHaveBeenCalledWith('dashboard', expect.any(String))
  expect(result.current.isInstalled('dash-1')).toBe(true)
  expect(result.current.getInstalledDashboardId('dash-1')).toBe('imported-dash-id')
})

it('installs a card-preset item by POSTing to the default dashboard and dispatching the event', async () => {
  // Payload matches the backend card shape — card_type (snake_case) is
  // what the Go handler and Dashboard.tsx both use.
  const presetJson = { card_type: 'custom_card', config: { foo: 'bar' }, title: 'Custom Card' }
  const sha256 = await computeSha256(JSON.stringify(presetJson))
  seedCache([makeItem({ id: 'preset-1', type: 'card-preset', downloadUrl: TRUSTED_DOWNLOAD_URL, sha256 })])

  const eventSpy = vi.fn()
  window.addEventListener('kc-add-card-from-marketplace', eventSpy)

  vi.mocked(globalThis.fetch).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(presetJson),
    text: () => Promise.resolve(JSON.stringify(presetJson)),
  } as Response)
  // GET /api/dashboards — return a list with a default dashboard.
  // Set as the persistent default so both reconciliation and installItem get the same data.
  mockApiGet.mockResolvedValue({ data: [{ id: 'dash-default', is_default: true }, { id: 'dash-other' }] })
  // POST /api/dashboards/:id/cards — success.
  mockApiPost.mockResolvedValueOnce({ data: { id: 'persisted-card-id' } })

  const { result } = renderHook(() => useMarketplace())
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  let installResult: unknown
  await act(async () => {
    installResult = await result.current.installItem(result.current.allItems[0])
  })

  // POST was called with the correct dashboard id and a card payload
  // that carries the card_type and config from the downloaded preset.
  expect(mockApiGet).toHaveBeenCalledWith('/api/dashboards')
  expect(mockApiPost).toHaveBeenCalledWith(
    '/api/dashboards/dash-default/cards',
    expect.objectContaining({
      card_type: 'custom_card',
      config: { foo: 'bar' },
      title: 'Custom Card',
      position: expect.objectContaining({ x: 0, y: 0 }),
    })
  )
  expect(installResult).toEqual({ type: 'card-preset', data: presetJson })
  expect(eventSpy).toHaveBeenCalled()
  expect(mockEmitInstall).toHaveBeenCalledWith('card-preset', expect.any(String))
  expect(result.current.isInstalled('preset-1')).toBe(true)

  window.removeEventListener('kc-add-card-from-marketplace', eventSpy)
})

it('does not mark card-preset installed when the backend POST fails (#6620)', async () => {
  const presetJson = { card_type: 'custom_card', config: {} }
  const sha256 = await computeSha256(JSON.stringify(presetJson))
  seedCache([makeItem({ id: 'preset-fail', type: 'card-preset', downloadUrl: TRUSTED_DOWNLOAD_URL, sha256 })])

  const eventSpy = vi.fn()
  window.addEventListener('kc-add-card-from-marketplace', eventSpy)

  vi.mocked(globalThis.fetch).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(presetJson),
    text: () => Promise.resolve(JSON.stringify(presetJson)),
  } as Response)
  // Set as persistent default so both reconciliation and installItem get the same data.
  mockApiGet.mockResolvedValue({ data: [{ id: 'dash-default', is_default: true }] })
  mockApiPost.mockRejectedValueOnce(new Error('backend exploded'))

  const { result } = renderHook(() => useMarketplace())
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  await expect(
    act(() => result.current.installItem(result.current.allItems[0]))
  ).rejects.toThrow('backend exploded')

  expect(mockEmitInstallFailed).toHaveBeenCalledWith('card-preset', expect.any(String), 'backend exploded', 'persist')
  expect(eventSpy).not.toHaveBeenCalled()
  expect(result.current.isInstalled('preset-fail')).toBe(false)

  window.removeEventListener('kc-add-card-from-marketplace', eventSpy)
})

it('installs a theme item and calls addCustomTheme', async () => {
  const themeJson = { id: 'theme-1', name: 'Dark Ocean', colors: {} }
  const sha256 = await computeSha256(JSON.stringify(themeJson))
  seedCache([makeItem({ id: 'theme-1', type: 'theme', downloadUrl: TRUSTED_DOWNLOAD_URL, sha256 })])

  const eventSpy = vi.fn()
  window.addEventListener('kc-custom-themes-changed', eventSpy)

  vi.mocked(globalThis.fetch).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(themeJson),
    text: () => Promise.resolve(JSON.stringify(themeJson)),
  } as Response)

  const { result } = renderHook(() => useMarketplace())
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  let installResult: unknown
  await act(async () => {
    installResult = await result.current.installItem(result.current.allItems[0])
  })

  expect(installResult).toEqual({ type: 'theme', data: themeJson })
  expect(mockAddCustomTheme).toHaveBeenCalledWith(themeJson)
  expect(eventSpy).toHaveBeenCalled()
  expect(mockEmitInstall).toHaveBeenCalledWith('theme', expect.any(String))
  expect(result.current.isInstalled('theme-1')).toBe(true)

  window.removeEventListener('kc-custom-themes-changed', eventSpy)
})

it('emits install-failed analytics on download network error', async () => {
  seedCache([makeItem({ id: 'fail-1', type: 'dashboard' })])

  vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('timeout'))

  const { result } = renderHook(() => useMarketplace())
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  await expect(
    act(() => result.current.installItem(result.current.allItems[0]))
  ).rejects.toThrow('timeout')

  expect(mockEmitInstallFailed).toHaveBeenCalledWith('dashboard', expect.any(String), 'timeout', 'download')
  expect(result.current.isInstalled('fail-1')).toBe(false)
})

it('emits install-failed analytics on HTTP error during download', async () => {
  seedCache([makeItem({ id: 'fail-2', type: 'dashboard' })])

  vi.mocked(globalThis.fetch).mockResolvedValueOnce({
    ok: false,
    status: 404,
  } as Response)

  const { result } = renderHook(() => useMarketplace())
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  await expect(
    act(() => result.current.installItem(result.current.allItems[0]))
  ).rejects.toThrow('Download failed: 404')

  expect(mockEmitInstallFailed).toHaveBeenCalledWith('dashboard', expect.any(String), 'HTTP 404', 'http_error')
})

it('rejects marketplace installs from untrusted download origins', async () => {
  seedCache([makeItem({ id: 'origin-fail', downloadUrl: UNTRUSTED_DOWNLOAD_URL })])

  const { result } = renderHook(() => useMarketplace())
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  await expect(
    act(() => result.current.installItem(result.current.allItems[0]))
  ).rejects.toThrow(`Marketplace download URL is not allowed: ${UNTRUSTED_DOWNLOAD_URL}`)

  expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  expect(mockEmitInstallFailed).toHaveBeenCalledWith(
    'dashboard',
    expect.any(String),
    `Marketplace download URL is not allowed: ${UNTRUSTED_DOWNLOAD_URL}`,
    'download'
  )
})

it('rejects marketplace installs when sha256 metadata is missing', async () => {
  seedCache([makeItem({ id: 'missing-sha', sha256: '' })])

  const { result } = renderHook(() => useMarketplace())
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  await expect(
    act(() => result.current.installItem(result.current.allItems[0]))
  ).rejects.toThrow('Marketplace item is missing required sha256 integrity metadata')

  expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  expect(mockEmitInstallFailed).toHaveBeenCalledWith(
    'dashboard',
    expect.any(String),
    'Marketplace item is missing required sha256 integrity metadata',
    'integrity'
  )
})

it('rejects marketplace installs when downloaded content hash does not match', async () => {
  seedCache([makeItem({ id: 'hash-fail', sha256: 'b'.repeat(64) })])
  const dashJson = { layout: [{ type: 'cluster_health' }] }

  vi.mocked(globalThis.fetch).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(dashJson),
    text: () => Promise.resolve(JSON.stringify(dashJson)),
  } as Response)

  const { result } = renderHook(() => useMarketplace())
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  await expect(
    act(() => result.current.installItem(result.current.allItems[0]))
  ).rejects.toThrow('Integrity check failed')

  expect(mockApiPost).not.toHaveBeenCalled()
  expect(mockEmitInstallFailed).toHaveBeenCalledWith(
    'dashboard',
    expect.any(String),
    expect.stringContaining('Integrity check failed'),
    'integrity'
  )
})

it('removes an installed dashboard via API delete', async () => {
  seedCache([makeItem({ id: 'dash-remove', type: 'dashboard' })])
  seedInstalledItems({
    'dash-remove': { dashboardId: 'db-123', installedAt: new Date().toISOString(), type: 'dashboard' },
  })
  mockApiDelete.mockResolvedValueOnce(undefined)

  const { result } = renderHook(() => useMarketplace())
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(result.current.isInstalled('dash-remove')).toBe(true)

  await act(async () => {
    await result.current.removeItem(result.current.allItems[0])
  })

  expect(mockApiDelete).toHaveBeenCalledWith('/api/dashboards/db-123')
  expect(mockEmitRemove).toHaveBeenCalledWith('dashboard')
  expect(result.current.isInstalled('dash-remove')).toBe(false)
})

it('removes an installed theme and calls removeCustomTheme', async () => {
  seedCache([makeItem({ id: 'theme-remove', type: 'theme' })])
  seedInstalledItems({
    'theme-remove': { installedAt: new Date().toISOString(), type: 'theme' },
  })

  const eventSpy = vi.fn()
  window.addEventListener('kc-custom-themes-changed', eventSpy)

  const { result } = renderHook(() => useMarketplace())
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  await act(async () => {
    await result.current.removeItem(result.current.allItems[0])
  })

  expect(mockRemoveCustomTheme).toHaveBeenCalledWith('theme-remove')
  expect(eventSpy).toHaveBeenCalled()
  expect(mockEmitRemove).toHaveBeenCalledWith('theme')
  expect(result.current.isInstalled('theme-remove')).toBe(false)

  window.removeEventListener('kc-custom-themes-changed', eventSpy)
})

it('removeItem is a no-op when item is not installed', async () => {
  seedCache([makeItem({ id: 'not-installed' })])

  const { result } = renderHook(() => useMarketplace())
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  await act(async () => {
    await result.current.removeItem(result.current.allItems[0])
  })

  expect(mockApiDelete).not.toHaveBeenCalled()
  expect(mockEmitRemove).not.toHaveBeenCalled()
})

// ──────────────────────── Installed items persistence ────────────────────────
})
