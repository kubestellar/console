import type { Card, DashboardData } from '../dashboardUtils'
import type { PendingDeploy } from '../persistence'

export interface DashboardStateHook {
  dashboard: DashboardData | null
  isLoading: boolean
  cards: Card[]
  pendingDeploys: PendingDeploy[]
  // Add other relevant state types
}
