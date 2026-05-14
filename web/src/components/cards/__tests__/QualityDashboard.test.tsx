import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import QualityDashboard from '../QualityDashboard'

// Mock i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// Mock card loading state
const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (opts: any) => mockUseCardLoadingState(opts),
  useReportCardDataState: vi.fn(),
}))

// Mock AI predictions hook
vi.mock('../../../hooks/useAIPredictions', () => ({
  useAIPredictions: () => ({
    isStale: false,
    lastDigest: Date.now(),
    sequence: 42,
  }),
}))

describe('QualityDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCardLoadingState.mockReturnValue({})
  })

  it('renders without crashing', () => {
    const { container } = render(<QualityDashboard />)
    expect(container).toBeTruthy()
  })

  it('displays the correct bug count', () => {
    render(<QualityDashboard />)
    // The component hardcodes 1418 for the POC
    expect(screen.getByText('1418')).toBeTruthy()
  })

  it('displays state integrity status', () => {
    render(<QualityDashboard />)
    expect(screen.getByText('quality.state_integrity')).toBeTruthy()
  })

  it('registers with the correct loading state configuration', () => {
    render(<QualityDashboard />)
    expect(mockUseCardLoadingState).toHaveBeenCalledWith(
      expect.objectContaining({
        isDemoData: true,
        hasAnyData: true,
      })
    )
  })
})
