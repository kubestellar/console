import React from 'react'
/**
 * Unit tests for CardFooter (addresses #22484 — card coverage gap).
 *
 * CardFooter is the shared footer rendered under every card by CardWrapper.
 * It gates three independent slots by prop:
 *   - InstallCTAFlow    (shown when !isCollapsed && showInstallCta)
 *   - PendingSwapNotification (shown when !isCollapsed && pendingSwap)
 *   - Summary panel     (shown when showSummary && lastSummary)
 *
 * Subcomponents are mocked so we test CardFooter's gating logic directly,
 * without pulling their i18n / button surface into scope.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CardFooter } from '../CardFooter'

vi.mock('../card-wrapper/InstallCTAFlow', () => ({
  InstallCTAFlow: ({ cardType, title }: { cardType: string; title: string }) => (
    <div data-testid="install-cta" data-card-type={cardType} data-title={title} />
  ),
}))

vi.mock('../card-wrapper/PendingSwapNotification', () => ({
  PendingSwapNotification: ({
    newTitle,
    defaultSnoozeDurationMs,
  }: {
    newTitle: string
    defaultSnoozeDurationMs: number
  }) => (
    <div
      data-testid="pending-swap"
      data-new-title={newTitle}
      data-snooze-ms={defaultSnoozeDurationMs}
    />
  ),
}))

type CardFooterProps = React.ComponentProps<typeof CardFooter>

function baseProps(overrides: Partial<CardFooterProps> = {}): CardFooterProps {
  return {
    isCollapsed: false,
    showInstallCta: false,
    cardType: 'cluster_health',
    title: 'Cluster Health',
    pendingSwap: undefined,
    newTitle: '',
    defaultSnoozeDurationMs: 60 * 60 * 1000,
    onSnooze: vi.fn(),
    onSwapNow: vi.fn(),
    onSwapCancel: vi.fn(),
    showSummary: false,
    lastSummary: undefined,
    summaryLabel: 'Last summary',
    ...overrides,
  }
}

describe('CardFooter', () => {
  it('renders nothing when all slots are disabled', () => {
    const { container } = render(<CardFooter {...baseProps()} />)
    expect(container.firstChild).toBeNull()
  })

  describe('InstallCTAFlow slot', () => {
    it('renders the install CTA when showInstallCta is true and the card is expanded', () => {
      render(
        <CardFooter
          {...baseProps({ showInstallCta: true, cardType: 'gpu_overview', title: 'GPU Overview' })}
        />,
      )
      const cta = screen.getByTestId('install-cta')
      expect(cta).toBeTruthy()
      expect(cta.getAttribute('data-card-type')).toBe('gpu_overview')
      expect(cta.getAttribute('data-title')).toBe('GPU Overview')
    })

    it('hides the install CTA when the card is collapsed', () => {
      render(<CardFooter {...baseProps({ showInstallCta: true, isCollapsed: true })} />)
      expect(screen.queryByTestId('install-cta')).toBeNull()
    })

    it('hides the install CTA when showInstallCta is false', () => {
      render(<CardFooter {...baseProps({ showInstallCta: false })} />)
      expect(screen.queryByTestId('install-cta')).toBeNull()
    })
  })

  describe('PendingSwapNotification slot', () => {
    const pendingSwap = {
      newType: 'gpu_overview',
      newTitle: 'GPU Overview',
      reason: 'AI suggested a better fit',
      swapAt: new Date('2026-01-01T00:00:00Z'),
    }

    it('renders the pending swap when provided and expanded', () => {
      render(
        <CardFooter
          {...baseProps({
            pendingSwap,
            newTitle: 'GPU Overview',
            defaultSnoozeDurationMs: 5000,
          })}
        />,
      )
      const swap = screen.getByTestId('pending-swap')
      expect(swap).toBeTruthy()
      expect(swap.getAttribute('data-new-title')).toBe('GPU Overview')
      expect(swap.getAttribute('data-snooze-ms')).toBe('5000')
    })

    it('hides the pending swap when the card is collapsed', () => {
      render(
        <CardFooter
          {...baseProps({ pendingSwap, newTitle: 'GPU Overview', isCollapsed: true })}
        />,
      )
      expect(screen.queryByTestId('pending-swap')).toBeNull()
    })

    it('hides the pending swap when pendingSwap is undefined', () => {
      render(<CardFooter {...baseProps({ pendingSwap: undefined })} />)
      expect(screen.queryByTestId('pending-swap')).toBeNull()
    })
  })

  describe('summary slot', () => {
    it('renders the summary when showSummary and lastSummary are both provided', () => {
      render(
        <CardFooter
          {...baseProps({
            showSummary: true,
            lastSummary: 'All clusters healthy',
            summaryLabel: 'Latest AI summary',
          })}
        />,
      )
      expect(screen.getByText('Latest AI summary')).toBeTruthy()
      expect(screen.getByText('All clusters healthy')).toBeTruthy()
    })

    it('hides the summary when showSummary is false, even with lastSummary set', () => {
      render(
        <CardFooter
          {...baseProps({
            showSummary: false,
            lastSummary: 'All clusters healthy',
            summaryLabel: 'Latest AI summary',
          })}
        />,
      )
      expect(screen.queryByText('All clusters healthy')).toBeNull()
      expect(screen.queryByText('Latest AI summary')).toBeNull()
    })

    it('hides the summary when lastSummary is empty', () => {
      render(
        <CardFooter
          {...baseProps({
            showSummary: true,
            lastSummary: '',
            summaryLabel: 'Latest AI summary',
          })}
        />,
      )
      expect(screen.queryByText('Latest AI summary')).toBeNull()
    })

    it('is independent of isCollapsed', () => {
      render(
        <CardFooter
          {...baseProps({
            isCollapsed: true,
            showSummary: true,
            lastSummary: 'Latest snapshot',
            summaryLabel: 'Summary',
          })}
        />,
      )
      // Summary intentionally renders even while collapsed — it floats above
      // the collapsed card.
      expect(screen.getByText('Latest snapshot')).toBeTruthy()
    })
  })

  it('can render all three slots at once', () => {
    render(
      <CardFooter
        {...baseProps({
          showInstallCta: true,
          cardType: 'gpu_overview',
          title: 'GPU Overview',
          pendingSwap: {
            newType: 'cluster_health',
            newTitle: 'Cluster Health',
            reason: 'swap',
            swapAt: new Date(),
          },
          newTitle: 'Cluster Health',
          showSummary: true,
          lastSummary: 'ok',
          summaryLabel: 'summary',
        })}
      />,
    )
    expect(screen.getByTestId('install-cta')).toBeTruthy()
    expect(screen.getByTestId('pending-swap')).toBeTruthy()
    expect(screen.getByText('summary')).toBeTruthy()
    expect(screen.getByText('ok')).toBeTruthy()
  })
})
