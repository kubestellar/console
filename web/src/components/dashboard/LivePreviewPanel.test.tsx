import type { ReactNode } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const PREVIEW_DEBOUNCE_MS = 800
const COMPILE_TIMEOUT_ERROR = 'Compilation error: timed out after 5000ms. Please try again.'
const mockCompileCardCode = vi.fn()
const mockCreateCardComponent = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../cards/DynamicCard', () => ({
  Tier1CardRuntime: () => <div>tier1 preview</div>,
}))

vi.mock('../../lib/dynamic-cards/compiler', () => ({
  compileCardCode: (...args: unknown[]) => mockCompileCardCode(...args),
  createCardComponent: (...args: unknown[]) => mockCreateCardComponent(...args),
}))

vi.mock('../cards/DynamicCardErrorBoundary', () => ({
  DynamicCardErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

import { LivePreviewPanel } from './LivePreviewPanel'

describe('LivePreviewPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockCompileCardCode.mockReset()
    mockCreateCardComponent.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('exports LivePreviewPanel component', () => {
    expect(LivePreviewPanel).toBeDefined()
    expect(typeof LivePreviewPanel).toBe('function')
  })

  it('keeps preview controls responsive while code is compiling', async () => {
    mockCompileCardCode.mockReturnValue(new Promise(() => {}))

    render(<LivePreviewPanel tier="tier2" t2Source="export default function Card() { return null }" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS)
    })

    expect(screen.getByText('dashboard.preview.compiling')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('dashboard.preview.hidePreview'))

    expect(screen.getByTitle('dashboard.preview.showPreview')).toBeInTheDocument()
  })

  it('shows compilation errors from the preview compiler', async () => {
    mockCompileCardCode.mockResolvedValue({
      code: null,
      error: COMPILE_TIMEOUT_ERROR,
    })

    render(<LivePreviewPanel tier="tier2" t2Source="export default function Card() { return null }" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS)
      await Promise.resolve()
    })

    expect(screen.getByText(COMPILE_TIMEOUT_ERROR)).toBeInTheDocument()
  })
})
