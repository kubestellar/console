import { DashboardView } from './DashboardView'
import { PageErrorBoundary } from '../PageErrorBoundary'

/**
 * Main dashboard page component.
 * Health status is displayed via DashboardHealthIndicator in the DashboardView header.
 */
export function Dashboard() {
  return (
    <PageErrorBoundary>
      <DashboardView />
    </PageErrorBoundary>
  )
}
