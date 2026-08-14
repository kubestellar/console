import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { ComplianceCards } from '../ComplianceCards'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
}))

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedComplianceStatus: () => ({
    data: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
  }),
}))

describe('ComplianceCards', () => {
  it('renders without crashing', () => {
    const { container } = render(<ComplianceCards />)
    expect(container).toBeTruthy()
  })
})
