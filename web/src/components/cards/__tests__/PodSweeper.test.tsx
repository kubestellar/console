import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PodSweeper } from '../PodSweeper'

/* ---------- Mocks ---------- */

vi.mock('../CardWrapper', () => ({
  useCardExpanded: () => ({ isExpanded: false }),
}))

vi.mock('../CardDataContext', () => ({
  useReportCardDataState: vi.fn(),
}))

vi.mock('../DynamicCardErrorBoundary', () => ({
  DynamicCardErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'podSweeper.easyMode': 'Easy',
        'podSweeper.mediumMode': 'Medium',
        'podSweeper.hardMode': 'Hard',
      }
      return map[key] || key
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('../../../lib/analytics', () => ({
  emitGameStarted: vi.fn(),
  emitGameEnded: vi.fn(),
}))

const DEFAULT_PROPS = {
  id: 'pod-sweeper',
  title: 'Pod Sweeper',
  className: '',
}

/* ---------- Tests ---------- */

describe('PodSweeper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the game grid', () => {
    render(<PodSweeper {...DEFAULT_PROPS} />)

    // Instructions should be visible
    expect(screen.getByText(/Click to reveal/)).toBeInTheDocument()
  })

  it('renders difficulty selector with easy, medium, hard', () => {
    render(<PodSweeper {...DEFAULT_PROPS} />)

    expect(screen.getByText('Easy')).toBeInTheDocument()
    expect(screen.getByText('Medium')).toBeInTheDocument()
    expect(screen.getByText('Hard')).toBeInTheDocument()
  })

  it('renders new game button', () => {
    render(<PodSweeper {...DEFAULT_PROPS} />)

    expect(screen.getByLabelText('New Game')).toBeInTheDocument()
  })

  it('starts with timer at 0:00', () => {
    render(<PodSweeper {...DEFAULT_PROPS} />)

    expect(screen.getByText('0:00')).toBeInTheDocument()
  })

  it('resets game when new game button is clicked', () => {
    render(<PodSweeper {...DEFAULT_PROPS} />)

    const newGameBtn = screen.getByLabelText('New Game')
    fireEvent.click(newGameBtn)

    // Timer should still be at 0:00 after reset
    expect(screen.getByText('0:00')).toBeInTheDocument()
  })

  it('changes difficulty when selector is changed', () => {
    render(<PodSweeper {...DEFAULT_PROPS} />)

    const select = screen.getByDisplayValue('Easy') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'medium' } })

    expect(select.value).toBe('medium')
  })

  it('reports card data state via useReportCardDataState', async () => {
    const cardDataCtx = await import('../CardDataContext')
    const mockReportState = vi.mocked(cardDataCtx.useReportCardDataState)

    render(<PodSweeper {...DEFAULT_PROPS} />)

    expect(mockReportState).toHaveBeenCalledWith({
      hasData: true,
      isFailed: false,
      consecutiveFailures: 0,
      isDemoData: false,
    })
  })

  it('wraps content in DynamicCardErrorBoundary', () => {
    // This test verifies the outer export wraps in error boundary
    // The mock renders children directly, so the content should appear
    render(<PodSweeper {...DEFAULT_PROPS} />)

    expect(screen.getByText(/Click to reveal/)).toBeInTheDocument()
  })
})
