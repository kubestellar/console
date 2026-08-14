import React from 'react'
/**
 * Unit tests for CardHeader (addresses #22484 — card coverage gap).
 *
 * CardHeader is the shared header rendered above every card by CardWrapper.
 * It composes: optional drag handle, optional resolved icon, title,
 * InfoTooltip (description or fallback), CardMeta, and CardToolbar.
 *
 * Subcomponents (InfoTooltip, CardMeta, CardToolbar) are mocked so this
 * suite tests only CardHeader's composition + prop-passthrough surface
 * without pulling their UI into scope.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CardHeader } from '../CardHeader'

vi.mock('../card-wrapper/InfoTooltip', () => ({
  InfoTooltip: ({ text }: { text: string }) => (
    <span data-testid="info-tooltip" data-text={text} />
  ),
}))

vi.mock('../CardMeta', () => ({
  CardMeta: (props: Record<string, unknown>) => (
    <div
      data-testid="card-meta"
      data-show-demo-indicator={String(props.showDemoIndicator)}
      data-is-demo-data={String(props.isDemoData)}
      data-is-live={String(props.isLive)}
      data-is-failed={String(props.isFailed)}
      data-consecutive-failures={String(props.consecutiveFailures)}
      data-show-refresh-indicator={String(props.showRefreshIndicator)}
      data-is-loading={String(props.isLoading)}
      data-is-visually-spinning={String(props.isVisuallySpinning)}
      data-has-last-updated={String(props.lastUpdated != null)}
    />
  ),
}))

vi.mock('../CardToolbar', () => ({
  CardToolbar: (props: Record<string, unknown>) => (
    <div
      data-testid="card-toolbar"
      data-title={String(props.title)}
      data-is-collapsed={String(props.isCollapsed)}
      data-is-failed={String(props.isFailed)}
      data-consecutive-failures={String(props.consecutiveFailures)}
      data-is-refresh-disabled={String(props.isRefreshDisabled)}
      data-is-refresh-spinning={String(props.isRefreshSpinning)}
      data-card-id={String(props.cardId)}
      data-card-type={String(props.cardType)}
      data-card-width={String(props.cardWidth)}
      data-card-height={String(props.cardHeight)}
      data-has-on-configure={String(typeof props.onConfigure === 'function')}
      data-has-on-remove={String(typeof props.onRemove === 'function')}
      data-has-on-refresh={String(typeof props.onRefresh === 'function')}
    />
  ),
}))

type CardHeaderProps = React.ComponentProps<typeof CardHeader>

function baseProps(overrides: Partial<CardHeaderProps> = {}): CardHeaderProps {
  return {
    dragHandle: undefined,
    resolvedIcon: undefined,
    resolvedIconColor: 'text-blue-500',
    title: 'Cluster Health',
    description: 'Shows cluster health status',
    t: ((key: string, defaultValue?: string) => defaultValue ?? key) as CardHeaderProps['t'],
    showDemoIndicator: false,
    effectiveIsDemoData: false,
    isLive: false,
    effectiveIsFailed: false,
    effectiveConsecutiveFailures: 0,
    showHeaderRefreshIndicator: false,
    effectiveIsLoading: false,
    isVisuallySpinning: false,
    effectiveLastUpdated: null,
    isCollapsed: false,
    onToggleCollapse: vi.fn(),
    onRefresh: vi.fn(),
    isRefreshDisabled: false,
    isRefreshSpinning: false,
    onExpandFullscreen: vi.fn(),
    onOpenBugReport: vi.fn(),
    cardId: 'card-1',
    cardType: 'cluster_health',
    cardWidth: 400,
    cardHeight: 300,
    onConfigure: undefined,
    onRemove: undefined,
    onWidthChange: undefined,
    onHeightChange: undefined,
    onShowWidgetExport: vi.fn(),
    ...overrides,
  }
}

describe('CardHeader', () => {
  it('renders the title and the tour anchor', () => {
    const { container } = render(<CardHeader {...baseProps({ title: 'GPU Overview' })} />)
    expect(screen.getByText('GPU Overview')).toBeTruthy()
    expect(container.querySelector('[data-tour="card-header"]')).toBeTruthy()
  })

  it('always renders the three composed subcomponents', () => {
    render(<CardHeader {...baseProps()} />)
    expect(screen.getByTestId('info-tooltip')).toBeTruthy()
    expect(screen.getByTestId('card-meta')).toBeTruthy()
    expect(screen.getByTestId('card-toolbar')).toBeTruthy()
  })

  describe('drag handle', () => {
    it('renders when provided', () => {
      render(
        <CardHeader
          {...baseProps({ dragHandle: <span data-testid="drag-handle">::</span> })}
        />,
      )
      expect(screen.getByTestId('drag-handle')).toBeTruthy()
    })

    it('is omitted when undefined', () => {
      render(<CardHeader {...baseProps()} />)
      expect(screen.queryByTestId('drag-handle')).toBeNull()
    })
  })

  describe('resolved icon', () => {
    it('renders the icon with resolvedIconColor when provided', () => {
      const Icon = ({ className }: { className?: string }) => (
        <svg data-testid="resolved-icon" className={className} />
      )
      render(
        <CardHeader
          {...baseProps({ resolvedIcon: Icon, resolvedIconColor: 'text-emerald-500' })}
        />,
      )
      const icon = screen.getByTestId('resolved-icon')
      expect(icon).toBeTruthy()
      // resolvedIconColor and shared classes are merged via cn(); assert the
      // resolvedIconColor token made it onto the icon.
      expect(icon.getAttribute('class') ?? '').toContain('text-emerald-500')
      expect(icon.getAttribute('class') ?? '').toContain('h-4')
    })

    it('omits the icon when resolvedIcon is undefined', () => {
      render(<CardHeader {...baseProps()} />)
      expect(screen.queryByTestId('resolved-icon')).toBeNull()
    })
  })

  describe('InfoTooltip description fallback (#21775 signature)', () => {
    it('passes the description straight through when non-empty', () => {
      render(
        <CardHeader
          {...baseProps({ description: 'Real description text' })}
        />,
      )
      expect(screen.getByTestId('info-tooltip').getAttribute('data-text')).toBe(
        'Real description text',
      )
    })

    it('falls back to the i18n messages.descriptionComingSoon key when description is empty', () => {
      // Our fake t() returns the defaultValue when provided; the fallback
      // template contains the title so we assert that surface.
      render(
        <CardHeader
          {...baseProps({ description: '', title: 'GPU Overview' })}
        />,
      )
      const tooltipText = screen.getByTestId('info-tooltip').getAttribute('data-text') ?? ''
      // fallback template: "{{title}} card. Description coming soon."
      // Our fake t() returns the raw defaultValue (no interpolation), which is
      // enough to prove the fallback branch fired — i18n substitution is
      // t's responsibility, not CardHeader's.
      expect(tooltipText).toContain('Description coming soon')
    })

    it('receives the title in the options bag so i18n can interpolate it', () => {
      const t = vi.fn(
        (key: string, defaultValue?: string, options?: Record<string, unknown>) => {
          if (key === 'messages.descriptionComingSoon' && options?.title) {
            return `${String(options.title)} card. Description coming soon.`
          }
          return defaultValue ?? key
        },
      )
      render(
        <CardHeader {...baseProps({ description: '', title: 'GPU Overview', t })} />,
      )
      expect(screen.getByTestId('info-tooltip').getAttribute('data-text')).toBe(
        'GPU Overview card. Description coming soon.',
      )
      expect(t).toHaveBeenCalledWith(
        'messages.descriptionComingSoon',
        expect.stringContaining('{{title}}'),
        expect.objectContaining({ title: 'GPU Overview' }),
      )
    })
  })

  describe('CardMeta prop passthrough', () => {
    it('forwards the meta prop shape (name-mapped effectiveIsFailed → isFailed, etc.)', () => {
      render(
        <CardHeader
          {...baseProps({
            showDemoIndicator: true,
            effectiveIsDemoData: true,
            isLive: true,
            effectiveIsFailed: true,
            effectiveConsecutiveFailures: 3,
            showHeaderRefreshIndicator: true,
            effectiveIsLoading: true,
            isVisuallySpinning: true,
            effectiveLastUpdated: new Date('2026-01-01T00:00:00Z'),
          })}
        />,
      )
      const meta = screen.getByTestId('card-meta')
      expect(meta.getAttribute('data-show-demo-indicator')).toBe('true')
      expect(meta.getAttribute('data-is-demo-data')).toBe('true')
      expect(meta.getAttribute('data-is-live')).toBe('true')
      expect(meta.getAttribute('data-is-failed')).toBe('true')
      expect(meta.getAttribute('data-consecutive-failures')).toBe('3')
      expect(meta.getAttribute('data-show-refresh-indicator')).toBe('true')
      expect(meta.getAttribute('data-is-loading')).toBe('true')
      expect(meta.getAttribute('data-is-visually-spinning')).toBe('true')
      expect(meta.getAttribute('data-has-last-updated')).toBe('true')
    })

    it('propagates a null lastUpdated (not the string "null")', () => {
      render(<CardHeader {...baseProps({ effectiveLastUpdated: null })} />)
      expect(screen.getByTestId('card-meta').getAttribute('data-has-last-updated')).toBe(
        'false',
      )
    })
  })

  describe('CardToolbar prop passthrough', () => {
    it('forwards title, cardId/cardType, and dimensions', () => {
      render(
        <CardHeader
          {...baseProps({
            title: 'Deployments',
            cardId: 'card-42',
            cardType: 'deployment_status',
            cardWidth: 512,
            cardHeight: 384,
          })}
        />,
      )
      const toolbar = screen.getByTestId('card-toolbar')
      expect(toolbar.getAttribute('data-title')).toBe('Deployments')
      expect(toolbar.getAttribute('data-card-id')).toBe('card-42')
      expect(toolbar.getAttribute('data-card-type')).toBe('deployment_status')
      expect(toolbar.getAttribute('data-card-width')).toBe('512')
      expect(toolbar.getAttribute('data-card-height')).toBe('384')
    })

    it('forwards failure + refresh flags (effectiveIsFailed, effectiveConsecutiveFailures, isRefresh*)', () => {
      render(
        <CardHeader
          {...baseProps({
            effectiveIsFailed: true,
            effectiveConsecutiveFailures: 5,
            isRefreshDisabled: true,
            isRefreshSpinning: true,
            isCollapsed: true,
          })}
        />,
      )
      const toolbar = screen.getByTestId('card-toolbar')
      expect(toolbar.getAttribute('data-is-failed')).toBe('true')
      expect(toolbar.getAttribute('data-consecutive-failures')).toBe('5')
      expect(toolbar.getAttribute('data-is-refresh-disabled')).toBe('true')
      expect(toolbar.getAttribute('data-is-refresh-spinning')).toBe('true')
      expect(toolbar.getAttribute('data-is-collapsed')).toBe('true')
    })

    it('reports whether optional callbacks (onConfigure/onRemove/onRefresh) were supplied', () => {
      const onConfigure = vi.fn()
      const onRemove = vi.fn()
      render(
        <CardHeader
          {...baseProps({
            onConfigure,
            onRemove,
            onRefresh: undefined,
          })}
        />,
      )
      const toolbar = screen.getByTestId('card-toolbar')
      expect(toolbar.getAttribute('data-has-on-configure')).toBe('true')
      expect(toolbar.getAttribute('data-has-on-remove')).toBe('true')
      expect(toolbar.getAttribute('data-has-on-refresh')).toBe('false')
    })
  })
})
