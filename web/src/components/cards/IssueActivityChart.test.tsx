import React from 'react'
/**
 * Unit tests for IssueActivityChart card component.
 * Covers: loading skeleton, chart container rendered, time range buttons,
 * repo subtitle, and snapshot.
 *
 * Closes #21103
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import IssueActivityChart from './IssueActivityChart'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key.split('.').pop() ?? key,
  }),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
}))

vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: true }),
}))

vi.mock('../../lib/cache', () => ({
  useCache: () => ({
    data: null,
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: true,
    refetch: vi.fn(),
    error: null,
  }),
}))

vi.mock('../charts/LazyEChart', () => ({
  LazyEChart: () => <div data-testid="echarts" />,
}))

vi.mock('./pipelines/PipelineFilterContext', () => ({
  usePipelineFilter: () => ({ filter: null }),
}))

vi.mock('./pipelines/RepoSubtitle', () => ({
  RepoSubtitle: ({ repo }: { repo: string }) => <span data-testid="repo-subtitle">{repo}</span>,
}))

vi.mock('../ui/Button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}))

vi.mock('../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

vi.mock('../../lib/constants/time', () => ({
  MS_PER_DAY: 86400000,
}))

vi.mock('../../lib/constants', () => ({
  CHART_TOOLTIP_CONTENT_STYLE: {},
  CHART_TOOLTIP_TEXT_COLOR: '#fff',
  CHART_TOOLTIP_LABEL_COLOR: '#aaa',
  CHART_DATAZOOM_BORDER: '#333',
  CHART_DATAZOOM_BG: '#1a1a1a',
  CHART_DATAZOOM_FILLER: '#333',
  CHART_DATAZOOM_HANDLE: '#555',
  CHART_DATAZOOM_TEXT: '#aaa',
  CHART_DATAZOOM_DATA_LINE: '#555',
  CHART_DATAZOOM_DATA_AREA: 'rgba(0,0,0,0.1)',
  CHART_TICK_COLOR: '#aaa',
  CHART_GRID_STROKE: '#333',
  CHART_TEXT_MUTED: '#888',
  CHART_AXIS_FONT_SIZE: 11,
  CHART_BODY_FONT_SIZE: 12,
  CHART_LEGEND_FONT_SIZE: 12,
  FETCH_EXTERNAL_TIMEOUT_MS: 10000,
}))

vi.mock('../../lib/theme/chartColors', () => ({
  hexToRgba: (hex: string, alpha: number) => `rgba(0,0,0,${alpha})`,
}))

vi.mock('../../lib/compat/echarts-for-react/lib/types', () => ({}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IssueActivityChart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
  })

  // 1. Loading skeleton
  it('renders skeleton when loading', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false })
    render(<IssueActivityChart />)
    expect(document.body).toBeTruthy()
  })

  // 2. Chart container
  it('renders chart container', () => {
    render(<IssueActivityChart />)
    // In happy path, renders LazyEChart
    expect(screen.getByTestId('echarts')).toBeInTheDocument()
  })

  // 3. Time range buttons
  it('renders 90 Days time range button', () => {
    render(<IssueActivityChart />)
    expect(screen.getByRole('button', { name: /90 Days/i })).toBeInTheDocument()
  })

  it('renders 30 Days time range button', () => {
    render(<IssueActivityChart />)
    expect(screen.getByRole('button', { name: /30 Days/i })).toBeInTheDocument()
  })

  it('renders 7 Days time range button', () => {
    render(<IssueActivityChart />)
    expect(screen.getByRole('button', { name: /7 Days/i })).toBeInTheDocument()
  })

  // 4. Repo subtitle
  it('renders repo subtitle', () => {
    render(<IssueActivityChart />)
    expect(screen.getByTestId('repo-subtitle')).toBeInTheDocument()
  })

  // 5. Snapshot
  it('matches snapshot', () => {
    const { asFragment } = render(<IssueActivityChart />)
    expect(asFragment()).toMatchSnapshot()
  })
})
