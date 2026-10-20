import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BatchProcessingBanner } from './BatchProcessingBanner'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('BatchProcessingBanner', () => {
  it('shows batch progress and opens the monitor', () => {
    const onOpen = vi.fn()
    render(<BatchProcessingBanner currentBatch={{ timestamp: 'batch-1', solvingCount: 2, totalEvents: 5 }} onOpen={onOpen} />)

    const banner = screen.getByRole('button', { name: /stellar\.batch\.processingBatch/ })
    expect(banner).toHaveTextContent('2/5 solving')
    expect(banner).toHaveTextContent('2 events actively solving')
    fireEvent.click(banner)
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('uses singular event text for one active solve', () => {
    render(<BatchProcessingBanner currentBatch={{ timestamp: 'batch-2', solvingCount: 1, totalEvents: 3 }} onOpen={vi.fn()} />)

    expect(screen.getByRole('button')).toHaveTextContent('1 event actively solving')
  })
})
