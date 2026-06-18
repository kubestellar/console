import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
const mockDelete = vi.fn()
const mockAuthFetch = vi.fn()
const mockFetchKagentStatus = vi.fn()
const mockFetchKagentiProviderStatus = vi.fn()

vi.mock('../api/core', () => ({
  api: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    delete: mockDelete,
  },
  authFetch: mockAuthFetch,
}))

vi.mock('../kagentBackend', () => ({
  fetchKagentStatus: mockFetchKagentStatus,
  fetchKagentAgents: vi.fn(),
  kagentChat: vi.fn(),
  kagentCallTool: vi.fn(),
}))

vi.mock('../kagentiProviderBackend', () => ({
  createSSEDecodeState: vi.fn(),
  consumeSSEChunk: vi.fn(),
  flushSSEDecodeState: vi.fn(),
  fetchKagentiProviderStatus: mockFetchKagentiProviderStatus,
  fetchKagentiProviderAgents: vi.fn(),
  discoverKagentiProviderAgent: vi.fn(),
  updateKagentiProviderConfig: vi.fn(),
  kagentiProviderChat: vi.fn(),
  kagentiProviderCallTool: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('api domain modules', () => {
  it('builds cluster helper requests', async () => {
    const { getNamespaces, getRbacRoles, getRbacUsers } = await import('../api/cluster')
    const signal = new AbortController().signal

    await getNamespaces('prod-cluster', { signal })
    await getRbacRoles({ cluster: 'prod-cluster', namespace: 'apps', includeSystem: true }, { timeout: 123, signal })
    await getRbacUsers('prod-cluster', { timeout: 321, signal })

    expect(mockAuthFetch).toHaveBeenCalledWith('/api/namespaces?cluster=prod-cluster', { signal })
    expect(mockGet).toHaveBeenNthCalledWith(1, '/api/rbac/roles?cluster=prod-cluster&namespace=apps&includeSystem=true', {
      timeout: 123,
      signal,
    })
    expect(mockGet).toHaveBeenNthCalledWith(2, '/api/rbac/users?cluster=prod-cluster', {
      timeout: 321,
      signal,
    })
  })

  it('builds settings helper requests', async () => {
    const { getSettings, saveSettings, exportSettings, importSettings } = await import('../api/settings')
    const payload = { theme: 'violet' }

    await getSettings()
    await saveSettings(payload)
    await exportSettings()
    await importSettings(payload)

    expect(mockGet).toHaveBeenCalledWith('/api/settings')
    expect(mockPut).toHaveBeenCalledWith('/api/settings', payload)
    expect(mockPost).toHaveBeenNthCalledWith(1, '/api/settings/export')
    expect(mockPost).toHaveBeenNthCalledWith(2, '/api/settings/import', payload)
  })

  it('builds dashboard helper requests', async () => {
    const {
      listDashboards,
      getDashboard,
      createDashboard,
      updateDashboard,
      deleteDashboard,
      addDashboardCard,
      updateDashboardCard,
      deleteDashboardCard,
      moveDashboardCard,
      exportDashboard,
      importDashboard,
    } = await import('../api/dashboard')

    await listDashboards()
    await getDashboard('dash-1')
    await createDashboard({ name: 'My Dashboard' })
    await updateDashboard('dash-1', { name: 'Updated' })
    await deleteDashboard('dash-1')
    await addDashboardCard('dash-1', { id: 'card-1' })
    await updateDashboardCard('card-1', { title: 'CPU' })
    await deleteDashboardCard('card-1')
    await moveDashboardCard('card-1', 'dash-2')
    await exportDashboard('dash-1')
    await importDashboard({ id: 'dash-imported' })

    expect(mockGet).toHaveBeenNthCalledWith(1, '/api/dashboards')
    expect(mockGet).toHaveBeenNthCalledWith(2, '/api/dashboards/dash-1')
    expect(mockPost).toHaveBeenNthCalledWith(1, '/api/dashboards', { name: 'My Dashboard' })
    expect(mockPut).toHaveBeenNthCalledWith(1, '/api/dashboards/dash-1', { name: 'Updated' })
    expect(mockDelete).toHaveBeenNthCalledWith(1, '/api/dashboards/dash-1')
    expect(mockPost).toHaveBeenNthCalledWith(2, '/api/dashboards/dash-1/cards', { id: 'card-1' })
    expect(mockPut).toHaveBeenNthCalledWith(2, '/api/cards/card-1', { title: 'CPU' })
    expect(mockDelete).toHaveBeenNthCalledWith(2, '/api/cards/card-1')
    expect(mockPost).toHaveBeenNthCalledWith(3, '/api/cards/card-1/move', { target_dashboard_id: 'dash-2' })
    expect(mockGet).toHaveBeenNthCalledWith(3, '/api/dashboards/dash-1/export')
    expect(mockPost).toHaveBeenNthCalledWith(4, '/api/dashboards/import', { id: 'dash-imported' })
  })

  it('re-exports domain helpers from api barrels', async () => {
    const domainApi = await import('../api')
    const indexApi = await import('../api/index')

    expect(domainApi.getNamespaces).toBeTypeOf('function')
    expect(domainApi.getSettings).toBeTypeOf('function')
    expect(domainApi.listDashboards).toBeTypeOf('function')

    await domainApi.fetchKagentStatus()
    await indexApi.fetchKagentiProviderStatus()

    expect(mockFetchKagentStatus).toHaveBeenCalledTimes(1)
    expect(mockFetchKagentiProviderStatus).toHaveBeenCalledTimes(1)
  })
})
