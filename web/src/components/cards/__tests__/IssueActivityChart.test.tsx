import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { IssueActivityChart } from '../IssueActivityChart'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
}))

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedIssueActivity: () => ({
    data: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
  }),
}))

describe('IssueActivityChart', () => {
  it('renders without crashing', () => {
    const { container } = render(<IssueActivityChart />)
    expect(container).toBeTruthy()
  })
})
