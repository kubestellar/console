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
  Legend: () => null,
}))

import NightlyE2EDetailPanel from '../NightlyE2EDetailPanel'

describe('NightlyE2EDetailPanel', () => {
  const mockT = ((key: string, fallback?: string) => fallback || key) as any

  it('renders without crashing when no guide selected', () => {
    const { container } = render(
      <NightlyE2EDetailPanel
        selectedGuide={null}
        allRuns={[]}
        onClose={vi.fn()}
        t={mockT}
      />
    )
    expect(container).toBeTruthy()
  })

  it('renders with selected guide', () => {
    const guide = {
      model: 'llama-3-70b',
      gpuType: 'H100',
      gpuCount: 4,
      platform: 'OCP',
      recentRuns: [],
    }
    const { container } = render(
      <NightlyE2EDetailPanel
        selectedGuide={guide as any}
        allRuns={[]}
        onClose={vi.fn()}
        t={mockT}
      />
    )
    expect(container).toBeTruthy()
  })
})
