import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../../../hooks/useClusterProgress', () => ({
  CLUSTER_PROGRESS_AUTO_DISMISS_MS: 1000,
}))

vi.mock('../../../../lib/clusterErrors', () => ({
  friendlyErrorMessage: (message: string) => `friendly:${message}`,
}))

import { ClusterProgressBanner } from '../ClusterProgressBanner'
import type { ClusterProgress } from '../../../../hooks/useClusterProgress'

const baseProgress: ClusterProgress = {
  tool: 'kind',
  name: 'dev-cluster',
  status: 'creating',
  message: 'Creating cluster',
  progress: 42,
}

afterEach(() => {
  vi.useRealTimers()
})

describe('ClusterProgressBanner', () => {
  it('renders active progress and supports manual dismiss', () => {
    const onDismiss = vi.fn()

    render(<ClusterProgressBanner progress={baseProgress} onDismiss={onDismiss} isStale={false} />)

    expect(screen.getByRole('status')).toHaveTextContent('Creating cluster')
    expect(screen.getByLabelText('actions.dismiss')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('actions.dismiss'))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('shows stale connection copy for failed stale progress', () => {
    render(
      <ClusterProgressBanner
        progress={{ ...baseProgress, status: 'failed', message: 'websocket timeout' }}
        onDismiss={vi.fn()}
        isStale
      />
    )

    expect(screen.getByText('settings.localClusters.connectionStale')).toBeInTheDocument()
  })

  it('auto-dismisses successful progress after the timeout', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()

    render(
      <ClusterProgressBanner
        progress={{ ...baseProgress, status: 'done', message: 'Cluster ready', progress: 100 }}
        onDismiss={onDismiss}
        isStale={false}
      />
    )

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
