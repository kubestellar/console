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

import { VClusterActionBanner } from '../VClusterActionBanner'
import type { VClusterActionFeedback } from '../../../../hooks/useLocalClusterTools'

const baseFeedback: VClusterActionFeedback = {
  action: 'connect',
  name: 'tenant-a',
  namespace: 'vcluster',
  state: 'pending',
}

afterEach(() => {
  vi.useRealTimers()
})

describe('VClusterActionBanner', () => {
  it('renders pending feedback and supports manual dismiss', () => {
    const onDismiss = vi.fn()

    render(<VClusterActionBanner feedback={baseFeedback} onDismiss={onDismiss} />)

    expect(screen.getByRole('status')).toHaveTextContent('settings.localClusters.vclusterFeedback.connect.pending')

    fireEvent.click(screen.getByLabelText('actions.dismiss'))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('shows friendly error messaging for failed feedback', () => {
    render(
      <VClusterActionBanner
        feedback={{ ...baseFeedback, state: 'error', message: 'connection refused' }}
        onDismiss={vi.fn()}
      />
    )

    expect(screen.getByText('friendly:connection refused')).toBeInTheDocument()
  })

  it('auto-dismisses successful feedback after the timeout', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()

    render(
      <VClusterActionBanner
        feedback={{ ...baseFeedback, state: 'success' }}
        onDismiss={onDismiss}
      />
    )

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
