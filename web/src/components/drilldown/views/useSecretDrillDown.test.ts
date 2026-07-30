import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const mockUseLocalAgent = vi.fn()
const mockRunKubectl = vi.fn()
const mockCopyToClipboard = vi.fn()
const mockPop = vi.fn()
const mockDrillToNamespace = vi.fn()
const mockDrillToCluster = vi.fn()

vi.mock('../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => mockUseLocalAgent(),
}))

vi.mock('../../../hooks/useDrillDownWebSocket', () => ({
  useDrillDownWebSocket: () => ({ runKubectl: mockRunKubectl }),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDown: () => ({ state: { stack: ['root'] }, pop: mockPop }),
  useDrillDownActions: () => ({
    drillToNamespace: mockDrillToNamespace,
    drillToCluster: mockDrillToCluster,
  }),
}))

vi.mock('../../../lib/clipboard', () => ({
  copyToClipboard: (text: string) => mockCopyToClipboard(text),
}))

import { useSecretDrillDown } from './useSecretDrillDown'

const baseData = { cluster: 'c1', namespace: 'ns1', secret: 'secret1' }

describe('useSecretDrillDown', () => {
  beforeEach(() => {
    mockUseLocalAgent.mockReset()
    mockRunKubectl.mockReset()
    mockCopyToClipboard.mockReset()
    mockPop.mockReset()
    mockDrillToNamespace.mockReset()
    mockDrillToCluster.mockReset()
  })

  it('returns idle initial state and does not fetch when agent is disconnected', () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: false })
    const { result } = renderHook(() => useSecretDrillDown(baseData))
    expect(result.current.cluster).toBe('c1')
    expect(result.current.namespace).toBe('ns1')
    expect(result.current.secretName).toBe('secret1')
    expect(result.current.secretData).toBeNull()
    expect(result.current.activeTab).toBe('overview')
    expect(result.current.tabs.map(tb => tb.id)).toEqual(['overview', 'data', 'describe', 'yaml'])
    expect(mockRunKubectl).not.toHaveBeenCalled()
  })

  it('success path: decodes base64 secret data and populates type/labels/describe/yaml', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    const secret = {
      type: 'kubernetes.io/tls',
      data: { 'tls.crt': btoa('cert-value'), 'tls.key': btoa('key-value') },
      metadata: { labels: { app: 'demo' } },
    }
    mockRunKubectl.mockImplementation((args: string[]) => {
      if (args[0] === 'get' && args[args.length - 1] === 'json') return Promise.resolve(JSON.stringify(secret))
      if (args[0] === 'describe') return Promise.resolve('describe output')
      return Promise.resolve('yaml output')
    })

    const { result } = renderHook(() => useSecretDrillDown(baseData))

    await waitFor(() => expect(result.current.secretData).not.toBeNull())
    expect(result.current.secretData).toEqual({ 'tls.crt': 'cert-value', 'tls.key': 'key-value' })
    expect(result.current.secretType).toBe('kubernetes.io/tls')
    expect(result.current.labels).toEqual({ app: 'demo' })
    await waitFor(() => expect(result.current.describeOutput).toBe('describe output'))
    await waitFor(() => expect(result.current.yamlOutput).toBe('yaml output'))
  })

  it('skips unsafe prototype-pollution key names when decoding secret data', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    const secret = {
      type: 'Opaque',
      data: { safe: btoa('ok'), __proto__: btoa('bad'), constructor: btoa('bad2') },
      metadata: {},
    }
    mockRunKubectl.mockResolvedValue(JSON.stringify(secret))

    const { result } = renderHook(() => useSecretDrillDown(baseData))
    await waitFor(() => expect(result.current.secretData).not.toBeNull())
    expect(result.current.secretData).toEqual({ safe: 'ok' })
  })

  it('error path: sets dataError when fetch throws', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    mockRunKubectl.mockImplementation((args: string[]) => {
      if (args[0] === 'get' && args[args.length - 1] === 'json') return Promise.reject(new Error('kubectl blew up'))
      return Promise.resolve('output')
    })

    const { result } = renderHook(() => useSecretDrillDown(baseData))
    await waitFor(() => expect(result.current.dataError).toBe('kubectl blew up'))
    expect(result.current.dataLoading).toBe(false)
  })

  it('displayedData truncates to 5 entries until showAllData is set', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    const data: Record<string, string> = {}
    for (let i = 0; i < 8; i++) data[`key${i}`] = btoa(`val${i}`)
    mockRunKubectl.mockResolvedValue(JSON.stringify({ type: 'Opaque', data, metadata: {} }))

    const { result } = renderHook(() => useSecretDrillDown(baseData))
    await waitFor(() => expect(result.current.dataEntries.length).toBe(8))
    expect(result.current.displayedData.length).toBe(5)

    act(() => result.current.setShowAllData(true))
    expect(result.current.displayedData.length).toBe(8)
  })

  it('toggleReveal and toggleYamlRevealed toggle their respective flags', () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: false })
    const { result } = renderHook(() => useSecretDrillDown(baseData))

    expect(result.current.revealedKeys.has('k1')).toBe(false)
    act(() => result.current.toggleReveal('k1'))
    expect(result.current.revealedKeys.has('k1')).toBe(true)

    expect(result.current.yamlRevealed).toBe(false)
    act(() => result.current.toggleYamlRevealed())
    expect(result.current.yamlRevealed).toBe(true)
  })

  it('handleCopy copies value and sets copiedField', () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: false })
    const { result } = renderHook(() => useSecretDrillDown(baseData))

    act(() => result.current.handleCopy('field1', 'value1'))
    expect(mockCopyToClipboard).toHaveBeenCalledWith('value1')
    expect(result.current.copiedField).toBe('field1')
  })
})
