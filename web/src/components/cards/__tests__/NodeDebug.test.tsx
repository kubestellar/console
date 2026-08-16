import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}))

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedNodes: vi.fn(() => ({ nodes: [], isLoading: false })),
}))

vi.mock('../../../hooks/useKubectl', () => ({
  useKubectl: () => ({ execute: vi.fn() }),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
}))

vi.mock('../../ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

describe('NodeDebug', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders without crashing', async () => {
    const { NodeDebug } = await import('../NodeDebug')
    render(<NodeDebug />)
    expect(document.body).toBeTruthy()
  })
})
