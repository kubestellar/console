import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CardRequestDialog } from './CardRequestDialog'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'orbit.cardRequest': `No card for ${opts?.project || 'project'}`,
        'orbit.cardRequestAction': 'Request',
        'orbit.cardRequestSending': 'Sending…',
        'orbit.cardRequestRequested': 'Requested',
        'orbit.cardRequestRetry': 'Retry',
      }
      return map[key] ?? key
    },
  }),
}))

vi.mock('../../lib/api', () => ({
  api: {
    post: vi.fn(),
  },
}))

vi.mock('../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/analytics')>()),
  emitGroundControlCardRequestOpened: vi.fn(),
}
))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}))

describe('CardRequestDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when missingProjects is empty', () => {
    const { container } = render(
      <CardRequestDialog missingProjects={[]} onClose={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the dialog when there are missing projects', () => {
    render(
      <CardRequestDialog
        missingProjects={['prometheus', 'grafana']}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Missing monitoring cards')).toBeInTheDocument()
  })

  it('displays all missing projects', () => {
    render(
      <CardRequestDialog
        missingProjects={['prometheus', 'grafana', 'jaeger']}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText(/No card for prometheus/)).toBeInTheDocument()
    expect(screen.getByText(/No card for grafana/)).toBeInTheDocument()
    expect(screen.getByText(/No card for jaeger/)).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <CardRequestDialog missingProjects={['prometheus']} onClose={onClose} />
    )
    const closeButton = screen.getByRole('button', { name: '' })
    closeButton.click()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
