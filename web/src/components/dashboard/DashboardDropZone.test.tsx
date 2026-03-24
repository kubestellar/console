import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DashboardDropZone } from './DashboardDropZone'
import { DashboardHealthIndicator } from './DashboardHealthIndicator'

// Mock @dnd-kit/core to avoid needing full DnD context
vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ isOver: false, setNodeRef: vi.fn() }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('.').pop() ?? key,
  }),
}))

// Mock DashboardHealthIndicator to simplify rendering test
vi.mock('./DashboardHealthIndicator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./DashboardHealthIndicator')>()
  return {
    ...actual,
    DashboardHealthIndicator: () => (
      <button aria-label="System health status: All systems healthy">All systems healthy</button>
    ),
  }
})

describe('DashboardDropZone Component', () => {
  it('exports DashboardDropZone component', () => {
    expect(DashboardDropZone).toBeDefined()
    expect(typeof DashboardDropZone).toBe('function')
  })

  it('health indicator is available for dashboard drop zone', () => {
    expect(DashboardHealthIndicator).toBeDefined()
    expect(typeof DashboardHealthIndicator).toBe('function')
  })

  it('shows health indicator in drop zone header when dragging', () => {
    render(
      <DashboardDropZone
        dashboards={[{ id: 'dash-1', name: 'Dashboard 1' }]}
        currentDashboardId="current"
        isDragging={true}
        onCreateDashboard={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /system health status/i })).toBeInTheDocument()
  })

  it('does not render when not dragging', () => {
    const { container } = render(
      <DashboardDropZone
        dashboards={[]}
        currentDashboardId="current"
        isDragging={false}
      />
    )
    expect(container.firstChild).toBeNull()
  })
})
