import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import IssueActivityChart from '../IssueActivityChart'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key.split('.').pop() ?? key }),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}))

vi.mock('../../../lib/cache', () => ({
  useCache: () => ({
    data: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

vi.mock('../pipelines/PipelineFilterContext', () => ({
  usePipelineFilter: () => ({ repoFilter: null }),
}))

vi.mock('../pipelines/RepoSubtitle', () => ({
  RepoSubtitle: ({ repo }: { repo: string }) => <span data-testid="repo-subtitle">{repo}</span>,
}))

vi.mock('../../charts/LazyEChart', () => ({
  LazyEChart: () => <div data-testid="chart" />,
}))

vi.mock('../ui/Button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}))

vi.mock('../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

vi.mock('../../../lib/constants/time', () => ({
  MS_PER_DAY: 86400000,
}))

vi.mock('../../../lib/constants', () => ({
  CHART_TOOLTIP_CONTENT_STYLE: {},
  CHART_TOOLTIP_TEXT_COLOR: '#fff',
  CHART_TOOLTIP_LABEL_COLOR: '#aaa',
  CHART_DATAZOOM_BORDER: '#333',
  CHART_DATAZOOM_BG: '#111',
  CHART_DATAZOOM_FILLER: '#222',
  CHART_DATAZOOM_HANDLE: '#444',
  CHART_DATAZOOM_TEXT: '#555',
  CHART_DATAZOOM_DATA_LINE: '#666',
  CHART_DATAZOOM_DATA_AREA: '#777',
  CHART_TICK_COLOR: '#888',
  CHART_GRID_STROKE: '#999',
  CHART_TEXT_MUTED: '#aaa',
  CHART_AXIS_FONT_SIZE: 11,
  CHART_BODY_FONT_SIZE: 12,
  CHART_LEGEND_FONT_SIZE: 13,
}))

vi.mock('../../../lib/theme/chartColors', () => ({
  hexToRgba: () => 'rgba(0,0,0,0.08)',
}))

describe('IssueActivityChart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the chart shell', () => {
    render(<IssueActivityChart />)
    expect(screen.getByTestId('chart')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '30d' })).toBeInTheDocument()
  })
})
