import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ImproveMissionDialog } from './ImproveMissionDialog'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/', search: '' }),
}))

vi.mock('../../lib/api', () => ({
  api: {
    post: vi.fn(),
  },
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}))

describe('ImproveMissionDialog', () => {
  it('does not render when mission is null', () => {
    const { container } = render(
      <ImproveMissionDialog
        mission={null}
        onClose={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders dialog when mission is provided', () => {
    const mission = {
      title: 'Test Mission',
      description: 'Test description',
      type: 'install' as const,
      category: 'Testing',
      tags: ['test'],
      steps: [],
      version: '1.0.0',
    }
    render(
      <ImproveMissionDialog
        mission={mission}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('displays mission title in dialog', () => {
    const mission = {
      title: 'Install Prometheus',
      description: 'Test description',
      type: 'install' as const,
      category: 'Monitoring',
      tags: [],
      steps: [],
      version: '1.0.0',
    }
    render(
      <ImproveMissionDialog
        mission={mission}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText(/Install Prometheus/)).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    const mission = {
      title: 'Test',
      description: 'Test',
      type: 'install' as const,
      category: 'Test',
      tags: [],
      steps: [],
      version: '1.0.0',
    }
    render(
      <ImproveMissionDialog
        mission={mission}
        onClose={onClose}
      />
    )
    const closeButtons = screen.getAllByRole('button')
    const closeButton = closeButtons.find(btn => 
      btn.querySelector('svg') || btn.getAttribute('aria-label')?.includes('close')
    )
    closeButton?.click()
    expect(onClose).toHaveBeenCalled()
  })
})
