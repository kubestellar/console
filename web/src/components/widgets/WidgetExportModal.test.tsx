import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { WidgetExportModal } from './WidgetExportModal'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValueOrOptions?: string | Record<string, unknown>) =>
      typeof defaultValueOrOptions === 'string' ? defaultValueOrOptions : key,
  }),
}))

describe('WidgetExportModal', () => {
  it('keeps the preview pane sticky while browsing widget options', () => {
    render(<WidgetExportModal isOpen onClose={vi.fn()} embedded />)

    const previewTitle = screen.getByText('common.preview')
    const previewPane = previewTitle.closest('div')?.parentElement

    expect(previewPane?.className).toContain('sticky')
    expect(previewPane?.className).toContain('top-0')

    fireEvent.click(screen.getByRole('button', { name: 'widgets.singleCard' }))

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
})
