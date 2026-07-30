import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const mockUseLocalAgent = vi.fn()
const mockRunKubectl = vi.fn()
const mockCopyToClipboard = vi.fn()

vi.mock('../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => mockUseLocalAgent(),
}))

vi.mock('../../../hooks/useDrillDownWebSocket', () => ({
  useDrillDownWebSocket: () => ({ runKubectl: mockRunKubectl }),
}))

vi.mock('../../../lib/clipboard', () => ({
  copyToClipboard: (text: string) => mockCopyToClipboard(text),
}))

// The global react-i18next mock in src/test/setup.ts returns a brand-new `t`
// function reference on every call, which is fine for components but causes
// useConfigMapDrillDown's fetchData/fetchDescribe/fetchYaml callbacks (which
// depend on `t`) to be recreated every render. That, in turn, destabilizes the
// mount effect's dependency array and can loop indefinitely when the effect's
// "missing context" branch keeps assigning fresh `{}`/`[]` literals. Override
// with a referentially-stable `t` here so this test suite doesn't hang.
const stableT = (key: string) => key
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: stableT }),
}))

import { useConfigMapDrillDown } from './useConfigMapDrillDown'

describe('useConfigMapDrillDown', () => {
  beforeEach(() => {
    mockUseLocalAgent.mockReset()
    mockRunKubectl.mockReset()
    mockCopyToClipboard.mockReset()
  })

  it('resets state to empty when required context is missing', () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    const { result } = renderHook(() => useConfigMapDrillDown('c1', 'ns1', 'cm1', false))
    expect(result.current.configmapData).toEqual({})
    expect(result.current.labels).toEqual({})
    expect(result.current.describeOutput).toBeNull()
    expect(result.current.yamlOutput).toBeNull()
    expect(mockRunKubectl).not.toHaveBeenCalled()
  })

  it('does not fetch when agent is disconnected', () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: false })
    const { result } = renderHook(() => useConfigMapDrillDown('c1', 'ns1', 'cm1', true))
    expect(result.current.configmapData).toBeNull()
    expect(mockRunKubectl).not.toHaveBeenCalled()
  })

  it('success path: populates configmap data, labels, describe, and yaml', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    const cm = { data: { key1: 'value1' }, metadata: { labels: { app: 'demo' } } }
    mockRunKubectl.mockImplementation((args: string[]) => {
      if (args[0] === 'get' && args[args.length - 1] === 'json') return Promise.resolve(JSON.stringify(cm))
      if (args[0] === 'describe') return Promise.resolve('describe output')
      return Promise.resolve('yaml output')
    })

    const { result } = renderHook(() => useConfigMapDrillDown('c1', 'ns1', 'cm1', true))

    await waitFor(() => expect(result.current.configmapData).toEqual({ key1: 'value1' }))
    expect(result.current.labels).toEqual({ app: 'demo' })
    await waitFor(() => expect(result.current.describeOutput).toBe('describe output'))
    await waitFor(() => expect(result.current.yamlOutput).toBe('yaml output'))
    expect(result.current.dataLoading).toBe(false)
  })

  it('JSON parse error: sets empty configmapData and labels', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    mockRunKubectl.mockImplementation((args: string[]) => {
      if (args[0] === 'get' && args[args.length - 1] === 'json') return Promise.resolve('not-json')
      return Promise.resolve('output')
    })

    const { result } = renderHook(() => useConfigMapDrillDown('c1', 'ns1', 'cm1', true))
    await waitFor(() => expect(result.current.configmapData).toEqual({}))
    expect(result.current.labels).toEqual({})
  })

  it('error path: sets dataError when fetch throws', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    mockRunKubectl.mockImplementation((args: string[]) => {
      if (args[0] === 'get' && args[args.length - 1] === 'json') return Promise.reject(new Error('kubectl blew up'))
      return Promise.resolve('output')
    })

    const { result } = renderHook(() => useConfigMapDrillDown('c1', 'ns1', 'cm1', true))
    await waitFor(() => expect(result.current.dataError).toBe('kubectl blew up'))
    expect(result.current.dataLoading).toBe(false)
  })

  it('toggleReveal and toggleRevealAll control isRevealed', () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: false })
    const { result } = renderHook(() => useConfigMapDrillDown('c1', 'ns1', 'cm1', true))

    expect(result.current.isRevealed('key1')).toBe(false)
    act(() => result.current.toggleReveal('key1'))
    expect(result.current.isRevealed('key1')).toBe(true)
    act(() => result.current.toggleReveal('key1'))
    expect(result.current.isRevealed('key1')).toBe(false)

    act(() => result.current.toggleRevealAll())
    expect(result.current.isRevealed('any-key')).toBe(true)
  })

  it('handleCopy copies value and sets copiedField', () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: false })
    const { result } = renderHook(() => useConfigMapDrillDown('c1', 'ns1', 'cm1', true))

    act(() => result.current.handleCopy('field1', 'value1'))
    expect(mockCopyToClipboard).toHaveBeenCalledWith('value1')
    expect(result.current.copiedField).toBe('field1')
  })
})
