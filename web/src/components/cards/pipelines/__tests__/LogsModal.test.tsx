import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { LogsModal } from '../LogsModal'

const mockIsDemoMode = vi.hoisted(() => ({ value: false }))
const mockFetchPipelineLog = vi.hoisted(() => vi.fn())

vi.mock('../../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode.value }),
}))
vi.mock('../../../../hooks/useGitHubPipelines', () => ({
  fetchPipelineLog: mockFetchPipelineLog,
}))

describe('LogsModal demo mode', () => {
  beforeEach(() => {
    mockFetchPipelineLog.mockReset()
    mockIsDemoMode.value = false
  })

  it('fetches the live log when not in demo mode', async () => {
    mockFetchPipelineLog.mockResolvedValue({ log: 'live log line' })
    render(<LogsModal repo="a/b" jobId={1} title="job" onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('live log line')).toBeTruthy())
    expect(mockFetchPipelineLog).toHaveBeenCalledWith('a/b', 1)
  })

  it('skips the network fetch in demo mode', async () => {
    mockIsDemoMode.value = true
    render(<LogsModal repo="a/b" jobId={1} title="job" onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Demo mode: job logs are not available.')).toBeTruthy())
    expect(mockFetchPipelineLog).not.toHaveBeenCalled()
  })
})
