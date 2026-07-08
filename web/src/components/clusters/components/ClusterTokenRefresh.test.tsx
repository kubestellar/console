import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { renderHook, act } from '@testing-library/react'
import { useClusterRefreshSpin, isTokenExpired, getIAMRefreshHint, CopyCommandButton } from './ClusterTokenRefresh'
import type { ClusterInfo } from '../../../hooks/useMCP'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('useClusterRefreshSpin', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns true when refreshing starts', () => {
    const { result } = renderHook(() => useClusterRefreshSpin(true, 1000))
    expect(result.current).toBe(true)
  })

  it('maintains spinning state for minimum duration', () => {
    const { result, rerender } = renderHook(
      ({ refreshing }) => useClusterRefreshSpin(refreshing, 1000),
      { initialProps: { refreshing: true } },
    )
    expect(result.current).toBe(true)

    rerender({ refreshing: false })
    expect(result.current).toBe(true)

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current).toBe(true)

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current).toBe(false)
  })

  it('stops spinning immediately if refresh duration exceeds minimum', () => {
    const { result, rerender } = renderHook(
      ({ refreshing }) => useClusterRefreshSpin(refreshing, 1000),
      { initialProps: { refreshing: true } },
    )

    act(() => {
      vi.advanceTimersByTime(1500)
    })

    rerender({ refreshing: false })
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(result.current).toBe(false)
  })
})

describe('isTokenExpired', () => {
  it('returns true when errorType is auth', () => {
    const cluster = { errorType: 'auth' } as ClusterInfo
    expect(isTokenExpired(cluster)).toBe(true)
  })

  it('returns false when errorType is not auth', () => {
    const cluster = { errorType: 'network' } as ClusterInfo
    expect(isTokenExpired(cluster)).toBe(false)
  })

  it('returns false when errorType is undefined', () => {
    const cluster = {} as ClusterInfo
    expect(isTokenExpired(cluster)).toBe(false)
  })
})

describe('getIAMRefreshHint', () => {
  it('returns null for non-exec auth methods', () => {
    const cluster = { authMethod: 'token', user: 'test', name: 'test' } as ClusterInfo
    expect(getIAMRefreshHint(cluster)).toBeNull()
  })

  it('returns aws sso login for AWS clusters', () => {
    const cluster = { authMethod: 'exec', user: 'aws-user', name: 'test' } as ClusterInfo
    expect(getIAMRefreshHint(cluster)).toBe('aws sso login')
  })

  it('returns aws sso login for EKS clusters by name', () => {
    const cluster = { authMethod: 'exec', user: 'test', name: 'eks-cluster' } as ClusterInfo
    expect(getIAMRefreshHint(cluster)).toBe('aws sso login')
  })

  it('returns gcloud auth login for GKE clusters', () => {
    const cluster = { authMethod: 'exec', user: 'gke-user', name: 'test' } as ClusterInfo
    expect(getIAMRefreshHint(cluster)).toBe('gcloud auth login')
  })

  it('returns gcloud auth login for GCP clusters by name', () => {
    const cluster = { authMethod: 'exec', user: 'test', name: 'gcp-cluster' } as ClusterInfo
    expect(getIAMRefreshHint(cluster)).toBe('gcloud auth login')
  })

  it('returns az login for Azure clusters', () => {
    const cluster = { authMethod: 'exec', user: 'az-user', name: 'test' } as ClusterInfo
    expect(getIAMRefreshHint(cluster)).toBe('az login')
  })

  it('returns az login for AKS clusters by name', () => {
    const cluster = { authMethod: 'exec', user: 'test', name: 'aks-cluster' } as ClusterInfo
    expect(getIAMRefreshHint(cluster)).toBe('az login')
  })

  it('returns oc login for OpenShift clusters', () => {
    const cluster = { authMethod: 'exec', user: 'test', name: 'openshift-cluster' } as ClusterInfo
    expect(getIAMRefreshHint(cluster)).toBe('oc login <api-server-url>')
  })

  it('returns null for unknown exec clusters', () => {
    const cluster = { authMethod: 'exec', user: 'unknown', name: 'test' } as ClusterInfo
    expect(getIAMRefreshHint(cluster)).toBeNull()
  })
})

describe('CopyCommandButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it('renders copy icon by default', () => {
    render(<CopyCommandButton text="test command" />)
    expect(screen.getByLabelText('Copy command to clipboard')).toBeInTheDocument()
  })

  it('copies text to clipboard when clicked', async () => {
    render(<CopyCommandButton text="aws sso login" />)
    const button = screen.getByLabelText('Copy command to clipboard')

    fireEvent.click(button)

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('aws sso login')
    })
  })

  it('shows check icon after copying', async () => {
    render(<CopyCommandButton text="test command" />)
    const button = screen.getByLabelText('Copy command to clipboard')

    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument()
    })
  })

  it('stops propagation on click', () => {
    const parentClick = vi.fn()
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        parentClick()
      }
    }
    const { container } = render(
      <div onClick={parentClick} onKeyDown={handleKeyDown} role="button" tabIndex={0}>
        <CopyCommandButton text="test" />
      </div>,
    )

    const button = screen.getByLabelText('Copy command to clipboard')
    fireEvent.click(button)

    expect(parentClick).not.toHaveBeenCalled()
  })
})
