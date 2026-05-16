import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { WidgetExportModal } from './WidgetExportModal'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, defaultValueOrOptions?: string | Record<string, unknown>) =>
      typeof defaultValueOrOptions === 'string' ? defaultValueOrOptions : (defaultValueOrOptions as any)?.defaultValue ?? key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('../../lib/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(undefined),
}))

describe('WidgetExportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the preview pane sticky while browsing widget options', () => {
    render(<WidgetExportModal isOpen onClose={vi.fn()} embedded />)

    const previewTitle = screen.getByText('common.preview')
    const previewPane = previewTitle.closest('div')?.parentElement

    expect(previewPane?.className).toContain('sticky')
    expect(previewPane?.className).toContain('top-0')

    fireEvent.click(screen.getByRole('tab', { name: 'widgets.singleCard' }))

    expect(previewPane?.className).toContain('sticky')
    expect(previewPane?.className).toContain('top-0')
  })

  it('scales wide template previews down from the top of the preview area', () => {
    const { container } = render(<WidgetExportModal isOpen onClose={vi.fn()} embedded />)

    fireEvent.click(screen.getByRole('button', { name: /Stats Bar/i }))

    const scaledPreview = container.querySelector('[style*="transform: scale"]') as HTMLDivElement | null

    expect(scaledPreview).toBeTruthy()
    expect(scaledPreview?.style.transformOrigin).toBe('top center')

    const scaleMatch = scaledPreview?.style.transform.match(/scale\(([^)]+)\)/)
    expect(scaleMatch).toBeTruthy()
    expect(Number.parseFloat(scaleMatch?.[1] || '1')).toBeLessThan(1)
  })

  it('exposes tab semantics and labeled form controls', () => {
    render(<WidgetExportModal isOpen={true} onClose={vi.fn()} />)

    const templatesTab = screen.getByRole('tab', { name: 'widgets.templates' })
    const cardTab = screen.getByRole('tab', { name: 'widgets.singleCard' })
    expect(templatesTab).toHaveAttribute('aria-selected', 'true')
    expect(cardTab).toHaveAttribute('aria-selected', 'false')

    const tabpanel = screen.getByRole('tabpanel')
    expect(tabpanel).toHaveAttribute('aria-labelledby', 'widget-export-tab-templates')
    expect(screen.getByLabelText('widgets.apiEndpoint')).toBeInTheDocument()
    expect(screen.getByLabelText('widgets.refreshInterval')).toHaveAttribute('min', '10')
  })

  it('toggles code view state and selection pressed state', () => {
    render(<WidgetExportModal isOpen={true} onClose={vi.fn()} />)

    const showCodeButton = screen.getByRole('button', { name: 'widgets.showCode' })
    expect(showCodeButton).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(showCodeButton)

    expect(screen.getByRole('button', { name: 'widgets.hideCode' })).toHaveAttribute('aria-pressed', 'true')
    // Check for some recognizable part of the exported code
    expect(screen.getByText(/refreshFrequency/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'widgets.singleCard' }))
    expect(screen.getByRole('button', { name: /Pod Issues/ })).toHaveAttribute('aria-pressed', 'false')
  })
})
