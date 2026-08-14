import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { ArgoCDApplications } from '../ArgoCDApplications'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
}))

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedArgoCDApplications: () => ({
    data: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
  }),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: [],
    isAllClustersSelected: true,
    customFilter: '',
  }),
}))

describe('ArgoCDApplications', () => {
  it('renders without crashing', () => {
    const { container } = render(<ArgoCDApplications />)
    expect(container).toBeTruthy()
  })
})
