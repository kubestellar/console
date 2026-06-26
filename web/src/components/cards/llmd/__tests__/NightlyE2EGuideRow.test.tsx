import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  LineChart: ({ children }: any) => <div>{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}))

vi.mock('lucide-react', () => ({
  TrendingUp: () => <span>TrendingUp</span>,
  TrendingDown: () => <span>TrendingDown</span>,
  Minus: () => <span>Minus</span>,
  ChevronRight: () => <span>ChevronRight</span>,
}))

import NightlyE2EGuideRow from '../NightlyE2EGuideRow'

describe('NightlyE2EGuideRow', () => {
  const mockT = ((key: string, fallback?: string) => fallback || key) as any

  it('renders without crashing', () => {
    const guide = {
      model: 'llama-3-70b',
      gpuType: 'H100',
      gpuCount: 4,
      platform: 'OCP',
      recentRuns: [],
      passRate: 0.9,
      avgDurationMin: 45,
      lastRun: null,
    }
    const { container } = render(
      <NightlyE2EGuideRow
        guide={guide as any}
        onClick={vi.fn()}
        t={mockT}
      />
    )
    expect(container).toBeTruthy()
  })

  it('renders with recent runs data', () => {
    const guide = {
      model: 'mistral-7b',
      gpuType: 'A100',
      gpuCount: 2,
      platform: 'GKE',
      recentRuns: [
        { status: 'completed', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T01:00:00Z' },
      ],
      passRate: 1.0,
      avgDurationMin: 30,
      lastRun: { status: 'completed', createdAt: '2026-01-01T00:00:00Z' },
    }
    const { container } = render(
      <NightlyE2EGuideRow
        guide={guide as any}
        onClick={vi.fn()}
        t={mockT}
      />
    )
    expect(container).toBeTruthy()
  })
})
