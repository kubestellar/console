import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { renderHook, act, waitFor } from '@testing-library/react'
import {
  useClusterRefreshSpin,
  isTokenExpired,
  getIAMRefreshHint,
  CopyCommandButton,
} from './ClusterTokenRefresh'
import type { ClusterInfo } from '../../../hooks/useMCP'
import { COPY_FEEDBACK_MS } from './ClusterGrid.constants'
import { copyToClipboard } from '../../../lib/clipboard'

vi.mock('../../../lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}))

describe('useClusterRefreshSpin', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts spinning immediately when refresh begins', () => {
    const { result } = renderHook(() => useClusterRefreshSpin(true, 1000))

    expect(result.current).toBe(true)
  })

  it('keeps spinning until the minimum duration has elapsed', () => {
    const { result, rerender } = renderHook(
      ({ refreshing }) => useClusterRefreshSpin(refreshing, 1000),
      { initialProps: { refreshing: true } },
    )

    rerender({ refreshing: false })

    act(() => {
      vi.advanceTimersByTime(999)
    })
    expect(result.current).toBe(true)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe(false)
  })

  it('stops immediately when the minimum duration has already elapsed', () => {
    const { result, rerender } = renderHook(
      ({ refreshing }) => useClusterRefreshSpin(refreshing, 1000),
      { initialProps: { refreshing: true } },
    )

    act(() => {
      vi.setSystemTime(1500)
    })

    rerender({ refreshing: false })

    act(() => {
      vi.advanceTimersByTime(0)
    })

    expect(result.current).toBe(false)
  })
})

describe('isTokenExpired', () => {
  it('returns true only for auth errors', () => {
    expect(isTokenExpired({ errorType: 'auth' } as ClusterInfo)).toBe(true)
    expect(isTokenExpired({ errorType: 'network' } as ClusterInfo)).toBe(false)
    expect(isTokenExpired({} as ClusterInfo)).toBe(false)
  })
})

describe('getIAMRefreshHint', () => {
  it('returns null for non-exec authentication', () => {
    expect(
      getIAMRefreshHint({ authMethod: 'token', user: 'aws-user', name: 'demo' } as ClusterInfo),
    ).toBeNull()
  })

  it('detects AWS, GCP, Azure, and OpenShift login commands', () => {
    expect(getIAMRefreshHint({ authMethod: 'exec', user: 'aws-user', name: 'demo' } as ClusterInfo)).toBe('aws sso login')
    expect(getIAMRefreshHint({ authMethod: 'exec', user: 'demo', name: 'gke-prod' } as ClusterInfo)).toBe('gcloud auth login')
    expect(getIAMRefreshHint({ authMethod: 'exec', user: 'demo', name: 'aks-dev' } as ClusterInfo)).toBe('az login')
    expect(getIAMRefreshHint({ authMethod: 'exec', user: 'demo', name: 'openshift-cluster' } as ClusterInfo)).toBe('oc login <api-server-url>')
  })

  it('returns null for unknown exec providers', () => {
    expect(
      getIAMRefreshHint({ authMethod: 'exec', user: 'custom-user', name: 'private-cluster' } as ClusterInfo),
    ).toBeNull()
  })
})

describe('CopyCommandButton', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.mocked(copyToClipboard).mockResolvedValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('copies the command and shows temporary feedback', async () => {
    render(<CopyCommandButton text="aws sso login" />)

    act(() => {
      fireEvent.click(screen.getByLabelText('Copy command to clipboard'))
    })

    expect(copyToClipboard).toHaveBeenCalledWith('aws sso login')
    expect(screen.getByText('Copied!')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(COPY_FEEDBACK_MS)
    })

    expect(screen.queryByText('Copied!')).not.toBeInTheDocument()
  })

  it('stops click propagation', () => {
    const parentClick = vi.fn()

    render(
      <div onClick={parentClick}>
        <CopyCommandButton text="az login" />
      </div>,
    )

    fireEvent.click(screen.getByLabelText('Copy command to clipboard'))

    expect(parentClick).not.toHaveBeenCalled()
  })
})
