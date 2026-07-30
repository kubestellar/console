import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k }),
}))

import { DashboardEmptyState } from '../DashboardEmptyState'

describe('DashboardEmptyState', () => {
  const onAdd = vi.fn()
  const onOpen = vi.fn()

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders header, description and action buttons', () => {
    render(<DashboardEmptyState onAddCard={onAdd} onOpenTemplates={onOpen} />)

    expect(screen.getByText('dashboard.empty.noCardsYet')).toBeInTheDocument()
    expect(screen.getByText('dashboard.empty.emptyDescription')).toBeInTheDocument()
    expect(screen.getByText('dashboard.empty.addCards')).toBeInTheDocument()
    expect(screen.getByText('dashboard.empty.startWithTemplate')).toBeInTheDocument()
  })

  it('calls handlers when buttons are clicked', () => {
    render(<DashboardEmptyState onAddCard={onAdd} onOpenTemplates={onOpen} />)

    fireEvent.click(screen.getByText('dashboard.empty.addCards'))
    fireEvent.click(screen.getByText('dashboard.empty.startWithTemplate'))

    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('shows connected status when connectionStatus=connected', () => {
    render(<DashboardEmptyState onAddCard={onAdd} onOpenTemplates={onOpen} connectionStatus="connected" />)

    // translation key is rendered by mocked t()
    expect(screen.getByText('dashboard.status.connected')).toBeInTheDocument()
    // icon uses a class for color; ensure element with that class exists
    const statusElem = screen.getByText('dashboard.status.connected').parentElement
    expect(statusElem).toBeTruthy()
    expect(statusElem).toHaveClass('text-green-400')
  })

  it('shows offline status when connectionStatus=offline', () => {
    render(<DashboardEmptyState onAddCard={onAdd} onOpenTemplates={onOpen} connectionStatus="offline" />)

    expect(screen.getByText('dashboard.status.offline')).toBeInTheDocument()
    const statusElem = screen.getByText('dashboard.status.offline').parentElement
    expect(statusElem).toBeTruthy()
    expect(statusElem).toHaveClass('text-red-400')
  })
})
