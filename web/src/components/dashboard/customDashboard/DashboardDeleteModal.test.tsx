import React from "react"
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
    initReactI18next: { type: '3rdParty', init: () => {} },
  }
})

vi.mock('../../../lib/modals', () => {
  const BaseModal = Object.assign(
    ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
    {
      Header: () => null,
      Content: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
      Footer: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
    }
  )
  return { BaseModal }
})

vi.mock('../../../lib/cn', () => ({
  cn: (...classes: string[]) => classes.filter(Boolean).join(' '),
}))

import { DashboardDeleteModal } from './DashboardDeleteModal'

describe('DashboardDeleteModal Component', () => {
  it('exports DashboardDeleteModal component', () => {
    expect(DashboardDeleteModal).toBeDefined()
    expect(typeof DashboardDeleteModal).toBe('function')
  })

  it('renders when open', () => {
    expect(() => render(<DashboardDeleteModal {...{
        isOpen: true,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        dashboardName: 'Test Dashboard',
      }} />)).not.toThrow()
  })

  it('renders when closed', () => {
    expect(() => render(<DashboardDeleteModal {...{
        isOpen: false,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        dashboardName: 'Test Dashboard',
      }} />)).not.toThrow()
  })

  it('shows healthy health indicator when healthStatus=healthy', () => {
    render(
      <DashboardDeleteModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        dashboardName="Test Dashboard"
        healthStatus="healthy"
      />
    )
    const indicator = screen.getByTestId('dashboard-health-indicator')
    expect(indicator).toBeTruthy()
    expect(indicator).toHaveClass('text-green-400')
    expect(screen.getByText('dashboard.health.healthy')).toBeInTheDocument()
  })

  it('shows degraded health indicator when healthStatus=degraded', () => {
    render(
      <DashboardDeleteModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        dashboardName="Test Dashboard"
        healthStatus="degraded"
      />
    )
    const indicator = screen.getByTestId('dashboard-health-indicator')
    expect(indicator).toBeTruthy()
    expect(indicator).toHaveClass('text-yellow-400')
    expect(screen.getByText('dashboard.health.degraded')).toBeInTheDocument()
  })

  it('shows offline health indicator when healthStatus=offline', () => {
    render(
      <DashboardDeleteModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        dashboardName="Test Dashboard"
        healthStatus="offline"
      />
    )
    const indicator = screen.getByTestId('dashboard-health-indicator')
    expect(indicator).toBeTruthy()
    expect(indicator).toHaveClass('text-red-400')
    expect(screen.getByText('dashboard.health.offline')).toBeInTheDocument()
  })

  it('does not show health indicator when healthStatus is not provided', () => {
    render(
      <DashboardDeleteModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        dashboardName="Test Dashboard"
      />
    )
    expect(screen.queryByTestId('dashboard-health-indicator')).toBeNull()
  })
})
