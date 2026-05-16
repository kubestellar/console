import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CardActionMenu } from './CardActionMenu'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('../../../lib/widgets/widgetRegistry', () => ({
  isCardExportable: () => false,
}))

vi.mock('../../../lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}))

vi.mock('../../../hooks/useDashboardContext', () => ({
  useDashboardContextOptional: () => null,
}))

describe('CardActionMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('wires menu semantics and restores focus on Escape', () => {
    render(
      <CardActionMenu
        cardId="pod-health"
        cardType="pod_health"
        onConfigure={vi.fn()}
        onRemove={vi.fn()}
        onShowWidgetExport={vi.fn()}
      />
    )

    const trigger = screen.getByRole('button', { name: 'cardWrapper.cardMenuTooltip' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)

    const menu = screen.getByRole('menu', { name: 'cardWrapper.cardMenuTooltip' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger).toHaveAttribute('aria-controls', 'card-action-menu-pod-health')
    expect(screen.getByRole('menuitem', { name: /common:actions.configure/i })).toHaveFocus()

    fireEvent.keyDown(menu, { key: 'Escape' })

    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('menu', { name: 'cardWrapper.cardMenuTooltip' })).not.toBeInTheDocument()
  })
})
