/**
 * Unit tests for useAddClusterForm.
 *
 * This hook was extracted from AddClusterDialog.tsx in PR #21902 and
 * previously had no dedicated test coverage. These tests exercise:
 *
 *   - initial tab/import/connect state
 *   - the cloud-CLI status fetch effect (only runs while `open`)
 *   - the kubeconfig preview/import happy and error paths
 *   - the connect tab's server-URL validation gate in goToConnectStep
 *   - resetting connect/import state when the dialog closes
 *
 * Addresses #21906 (coverage gap for hooks extracted in #21902).
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { agentFetch, emitClusterCreated } = vi.hoisted(() => ({
  agentFetch: vi.fn(),
  emitClusterCreated: vi.fn(),
}))

vi.mock('../../../hooks/mcp/shared', () => ({ agentFetch }))
vi.mock('../../../lib/analytics', () => ({ emitClusterCreated }))
vi.mock('../../../lib/constants', () => ({
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8080',
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
}))

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: vi.fn().mockResolvedValue(body) } as unknown as Response
}

import { useAddClusterForm } from '../useAddClusterForm'


async function renderAddClusterForm(open: boolean, onClose = vi.fn()) {
  let hook!: ReturnType<typeof renderHook<ReturnType<typeof useAddClusterForm>, unknown>>
  await act(async () => {
    hook = renderHook(() => useAddClusterForm({ open, onClose }))
    await Promise.resolve()
  })
  return hook
}

describe('useAddClusterForm', () => {
  beforeEach(() => {
    agentFetch.mockReset().mockResolvedValue(jsonResponse({ clis: [] }))
    emitClusterCreated.mockClear()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('defaults to the command-line tab with idle import/connect state', async () => {
    const { result } = await renderAddClusterForm(true)
    expect(result.current.activeTab).toBe('command-line')
    expect(result.current.importState).toBe('idle')
    expect(result.current.isLoading).toBe(false)
  })

  it('fetches cloud CLI status only while the dialog is open', async () => {
    await renderAddClusterForm(true)
    expect(agentFetch).toHaveBeenCalledWith(
      'http://localhost:8080/cloud-cli-status',
      expect.any(Object)
    )
  })

  it('does not fetch cloud CLI status while the dialog is closed', async () => {
    await renderAddClusterForm(false)
    expect(agentFetch).not.toHaveBeenCalled()
  })

  it('handlePreview populates previewContexts on a successful kubeconfig preview', async () => {
    const contexts = [{ contextName: 'ctx-a', clusterName: 'a', serverUrl: 'https://a', isNew: true }]
    agentFetch.mockResolvedValueOnce(jsonResponse({ clis: [] }))
    const { result } = await renderAddClusterForm(true)

    act(() => { result.current.setKubeconfigYaml('apiVersion: v1') })
    agentFetch.mockResolvedValueOnce(jsonResponse({ contexts }))
    await act(async () => { await result.current.handlePreview() })

    expect(result.current.importState).toBe('previewed')
    expect(result.current.previewContexts).toEqual(contexts)
  })

  it('handlePreview sets an error state and message when the preview request fails', async () => {
    const { result } = await renderAddClusterForm(true)
    agentFetch.mockResolvedValueOnce(jsonResponse({ error: 'bad kubeconfig' }, false, 400))
    await act(async () => { await result.current.handlePreview() })

    expect(result.current.importState).toBe('error')
    expect(result.current.errorMessage).toBe('bad kubeconfig')
  })

  it('handleImport marks import done and schedules onClose after the success delay', async () => {
    const onClose = vi.fn()
    const { result } = await renderAddClusterForm(true, onClose)
    agentFetch.mockResolvedValueOnce(jsonResponse({ importedCount: 2 }))
    await act(async () => { await result.current.handleImport() })

    expect(result.current.importState).toBe('done')
    expect(result.current.importedCount).toBe(2)

    act(() => { vi.advanceTimersByTime(1500) })
    expect(onClose).toHaveBeenCalled()
  })

  describe('goToConnectStep validation', () => {
    it('blocks advancing past step 1 without a valid server URL', async () => {
      const { result } = await renderAddClusterForm(true)
      expect(result.current.connectTabState.connectStep).toBe(1)
      act(() => { result.current.connectTabState.goToConnectStep(2) })
      expect(result.current.connectTabState.connectStep).toBe(1)
      expect(result.current.connectTabState.connectError).toContain('valid URL')
    })

    it('advances to step 2 once a valid server URL is set', async () => {
      const { result } = await renderAddClusterForm(true)
      act(() => { result.current.connectTabState.setServerUrl('https://api.example.com:6443') })
      act(() => { result.current.connectTabState.goToConnectStep(2) })
      expect(result.current.connectTabState.connectStep).toBe(2)
      expect(result.current.connectTabState.connectError).toBe('')
    })

    it('auto-fills context/cluster name from the host when reaching step 3', async () => {
      const { result } = await renderAddClusterForm(true)
      act(() => { result.current.connectTabState.setServerUrl('https://api.example.com:6443') })
      act(() => { result.current.connectTabState.goToConnectStep(3) })
      expect(result.current.connectTabState.contextName).toBe('api-example-com')
      expect(result.current.connectTabState.clusterName).toBe('api-example-com')
    })
  })

  it('resets connect and import state when the dialog transitions to closed', async () => {
    let hook!: ReturnType<typeof renderHook<ReturnType<typeof useAddClusterForm>, { open: boolean }>>
    await act(async () => {
      hook = renderHook(
        ({ open }) => useAddClusterForm({ open, onClose: vi.fn() }),
        { initialProps: { open: true } }
      )
      await Promise.resolve()
    })
    const { result, rerender } = hook
    act(() => { result.current.setKubeconfigYaml('some-yaml') })
    expect(result.current.kubeconfigYaml).toBe('some-yaml')

    rerender({ open: false })
    expect(result.current.kubeconfigYaml).toBe('')
    expect(result.current.connectTabState.connectStep).toBe(1)
  })
})
