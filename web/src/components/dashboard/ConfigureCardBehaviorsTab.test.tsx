import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { TFunction } from 'i18next'
import { ConfigureCardBehaviorsTab } from './ConfigureCardBehaviorsTab'
import type { CardBehavior } from './cardConfigData'

const translations: Record<string, string> = {
  'dashboard.configure.noBehaviors': 'No behaviors available for this card',
}

const t = ((key: string, fallback?: string) => translations[key] ?? fallback ?? key) as TFunction

const cardBehaviors: CardBehavior[] = [
  { key: 'autoRefresh', label: 'Auto-refresh', description: 'Automatically refresh every 30 seconds', default: true },
  { key: 'showUnhealthyFirst', label: 'Prioritize unhealthy', description: 'Show unhealthy items first', default: false },
]

describe('ConfigureCardBehaviorsTab Component', () => {
  it('shows the empty state message when there are no behaviors', () => {
    render(
      <ConfigureCardBehaviorsTab
        cardBehaviors={[]}
        behaviors={{}}
        t={t}
        toggleBehavior={vi.fn()}
      />,
    )

    expect(screen.getByText('No behaviors available for this card')).toBeVisible()
  })

  it('renders a label and description for each behavior', () => {
    render(
      <ConfigureCardBehaviorsTab
        cardBehaviors={cardBehaviors}
        behaviors={{}}
        t={t}
        toggleBehavior={vi.fn()}
      />,
    )

    expect(screen.getByText('Auto-refresh')).toBeVisible()
    expect(screen.getByText('Automatically refresh every 30 seconds')).toBeVisible()
    expect(screen.getByText('Prioritize unhealthy')).toBeVisible()
    expect(screen.getByText('Show unhealthy items first')).toBeVisible()
  })

  it('calls toggleBehavior with the behavior key when clicked', () => {
    const toggleBehavior = vi.fn()
    render(
      <ConfigureCardBehaviorsTab
        cardBehaviors={cardBehaviors}
        behaviors={{}}
        t={t}
        toggleBehavior={toggleBehavior}
      />,
    )

    fireEvent.click(screen.getByText('Auto-refresh'))
    expect(toggleBehavior).toHaveBeenCalledWith('autoRefresh')
  })

  it('renders a checkmark svg for enabled behaviors only', () => {
    const { container } = render(
      <ConfigureCardBehaviorsTab
        cardBehaviors={cardBehaviors}
        behaviors={{ autoRefresh: true, showUnhealthyFirst: false }}
        t={t}
        toggleBehavior={vi.fn()}
      />,
    )

    expect(container.querySelectorAll('svg')).toHaveLength(1)
  })
})
