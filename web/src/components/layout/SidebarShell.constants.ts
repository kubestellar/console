import { ROUTES } from '../../config/routes'
import { STORAGE_KEY_GROUND_CONTROL_DASHBOARDS } from '../../lib/constants/storage'
import { safeGetJSON } from '../../lib/utils/localStorage'

export const SIDEBAR_MIN_WIDTH_PX = 180
export const SIDEBAR_MAX_WIDTH_PX = 480
export const SIDEBAR_RESIZE_STEP_PX = 16
export const SIDEBAR_RESIZE_HANDLE_TOP_PX = 160
export const SIDEBAR_RESIZE_HANDLE_OFFSET_PX = 3
export const SIDEBAR_RESIZE_HANDLE_WIDTH_PX = 6

export const PRIMARY_SECTION_INDEX = 0

export const HREF_TO_DASHBOARD_ID: Record<string, string> = {
  [ROUTES.HOME]: 'main', [ROUTES.COMPUTE]: 'compute', [ROUTES.SECURITY]: 'security',
  [ROUTES.GITOPS]: 'gitops', [ROUTES.STORAGE]: 'storage', [ROUTES.NETWORK]: 'network',
  [ROUTES.EVENTS]: 'events', [ROUTES.ALERTS]: 'alerts', [ROUTES.WORKLOADS]: 'workloads', [ROUTES.OPERATORS]: 'operators',
  [ROUTES.CLUSTERS]: 'clusters', [ROUTES.COMPLIANCE]: 'compliance', [ROUTES.COST]: 'cost',
  [ROUTES.GPU_RESERVATIONS]: 'gpu', [ROUTES.NODES]: 'nodes', [ROUTES.DEPLOYMENTS]: 'deployments',
  [ROUTES.PODS]: 'pods', [ROUTES.SERVICES]: 'services', [ROUTES.HELM]: 'helm',
  [ROUTES.AI_ML]: 'ai-ml', [ROUTES.CI_CD]: 'ci-cd',
  [ROUTES.LOGS]: 'logs', [ROUTES.DATA_COMPLIANCE]: 'data-compliance', [ROUTES.ARCADE]: 'arcade',
  [ROUTES.DEPLOY]: 'deploy', [ROUTES.AI_AGENTS]: 'ai-agents',
  [ROUTES.LLM_D_BENCHMARKS]: 'llm-d-benchmarks', [ROUTES.CLUSTER_ADMIN]: 'cluster-admin',
  [ROUTES.INSIGHTS]: 'insights', [ROUTES.DRASI]: 'drasi',
  [ROUTES.MULTI_TENANCY]: 'multi-tenancy', [ROUTES.ACMM]: 'acmm',
}

const CUSTOM_DASHBOARD_PREFIX = ROUTES.CUSTOM_DASHBOARD.replace(':id', '')

export function isGroundControlItem(href: string): boolean {
  if (!href.startsWith(CUSTOM_DASHBOARD_PREFIX)) return false
  const dashboardId = href.slice(CUSTOM_DASHBOARD_PREFIX.length)
  const gcMapping = safeGetJSON<Record<string, unknown>>(STORAGE_KEY_GROUND_CONTROL_DASHBOARDS) ?? {}
  return dashboardId in gcMapping
}

export const SIDEBAR_AUTO_HIDE_MS = 2000
export const COLLAPSED_BADGE_MAX_COUNT = 99
export const COLLAPSED_BADGE_BASE_CLASS = 'absolute -top-1 -right-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full border border-background px-0.5 text-[10px] font-bold leading-none shadow-sm'
export const COLLAPSED_BADGE_DEFAULT_COLOR_CLASS = 'bg-primary text-primary-foreground'
