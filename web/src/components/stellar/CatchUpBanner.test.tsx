import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CatchUpBanner } from './CatchUpBanner'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'stellar.catchUp.title': 'While you were away',
      'stellar.catchUp.dismissAriaLabel': 'Dismiss catch-up summary',
    }[key] ?? key),
  }),
}))

describe('CatchUpBanner', () => {
  it('renders structured highlights as a pointer list', () => {
    render(
      <CatchUpBanner
        catchUp={{
          kind: 'summary',
          summary: '3 events fired while you were away. 1 resource still needs attention.',
          highlights: [
            'Away for 2h 15m (since 13:52 UTC).',
            '[WARNING] Unhealthy on prod-cluster',
            'Still watching 1 resource.',
          ],
        }}
        onDismiss={() => {}}
      />
    )

    expect(screen.getByText('While you were away')).toBeInTheDocument()
    expect(screen.getByText('Away for 2h 15m (since 13:52 UTC).')).toBeInTheDocument()
    expect(screen.getByText('[WARNING] Unhealthy on prod-cluster')).toBeInTheDocument()
    expect(screen.getByText('Still watching 1 resource.')).toBeInTheDocument()
  })

  it('falls back to splitting a plain summary into readable lines', () => {
    render(
      <CatchUpBanner
        catchUp={{
          kind: 'summary',
          summary: '3 events fired while you were away. 1 watch resolved. Nothing is still being watched right now.',
        }}
        onDismiss={() => {}}
      />
    )

    expect(screen.getByText('3 events fired while you were away.')).toBeInTheDocument()
    expect(screen.getByText('1 watch resolved.')).toBeInTheDocument()
    expect(screen.getByText('Nothing is still being watched right now.')).toBeInTheDocument()
  })
})
