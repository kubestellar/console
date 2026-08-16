import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}))

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: vi.fn(() => ({ clusters: [], isLoading: false })),
}))

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedPods: vi.fn(() => ({ pods: [], isLoading: false })),
  useCachedNamespaces: vi.fn(() => ({ namespaces: [], isLoading: false })),
}))

vi.mock('../../../hooks/mcp/workloads', () => ({
  usePodLogs: vi.fn(() => ({ logs: null, isLoading: false, isFailed: false, error: null })),
}))

vi.mock('../../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useDemoMode')>()),
  useDemoMode: () => ({ isDemoMode: false }),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ cluster: null, namespace: null }),
}))

describe('PodLogs', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders without crashing', async () => {
    const { PodLogs } = await import('../PodLogs')
    render(<PodLogs />)
    expect(document.body).toBeTruthy()
  })

  it('renders with config prop', async () => {
    const { PodLogs } = await import('../PodLogs')
    render(<PodLogs config={{ cluster: 'prod', namespace: 'default' }} />)
    expect(document.body).toBeTruthy()
  })
})
