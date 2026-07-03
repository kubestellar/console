import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ShareMissionDialog } from './ShareMissionDialog'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe('ShareMissionDialog', () => {
  it('does not render when shareUrl is null', () => {
    const { container } = render(
      <ShareMissionDialog
        shareUrl={null}
        onClose={vi.fn()}
        missionTitle="Test Mission"
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders dialog when shareUrl is provided', () => {
    render(
      <ShareMissionDialog
        shareUrl="https://console.kubestellar.io/missions/install-prometheus"
        onClose={vi.fn()}
        missionTitle="Install Prometheus"
      />
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('displays mission title in dialog', () => {
    render(
      <ShareMissionDialog
        shareUrl="https://example.com/mission/123"
        onClose={vi.fn()}
        missionTitle="Deploy Application"
      />
    )
    expect(screen.getByText(/Deploy Application/)).toBeInTheDocument()
  })

  it('displays shareable URL', () => {
    const url = 'https://console.kubestellar.io/missions/test'
    render(
      <ShareMissionDialog
        shareUrl={url}
        onClose={vi.fn()}
        missionTitle="Test"
      />
    )
    expect(screen.getByText(url)).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <ShareMissionDialog
        shareUrl="https://example.com/mission"
        onClose={onClose}
        missionTitle="Mission"
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
