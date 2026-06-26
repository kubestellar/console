import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { authFetch } from '../../../lib/api'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import { ARTIFACT_HUB_DEMO_DATA, type ArtifactHubDemoData } from './demoData'

export interface ArtifactHubStatus {
  packages: number
  repositories: number
  organizations: number
  users: number
  health: 'healthy' | 'degraded'
  lastCheckTime: string
}

const INITIAL_DATA: ArtifactHubStatus = {
  packages: 0,
  repositories: 0,
  organizations: 0,
  users: 0,
  health: 'healthy',
  lastCheckTime: new Date().toISOString(),
}

const CACHE_KEY = 'artifact-hub-status'
const ARTIFACT_HUB_STATS_URL = 'https://artifacthub.io/api/v1/stats'

interface ArtifactHubStatsResponse {
  packages?: number
  repositories?: number
  organizations?: number
  users?: number
}

async function fetchArtifactHubStatus(): Promise<ArtifactHubStatus> {
  const proxyUrl = `/api/card-proxy?url=${encodeURIComponent(ARTIFACT_HUB_STATS_URL)}`
  const resp = await authFetch(proxyUrl, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`)
  }

  const data: ArtifactHubStatsResponse = await resp.json()

  return {
    packages: data.packages ?? 0,
    repositories: data.repositories ?? 0,
    organizations: data.organizations ?? 0,
    users: data.users ?? 0,
    health: 'healthy',
    lastCheckTime: new Date().toISOString(),
  }
}

function toDemoStatus(demo: ArtifactHubDemoData): ArtifactHubStatus {
  return {
    packages: demo.packages,
    repositories: demo.repositories,
    organizations: demo.organizations,
    users: demo.users,
    health: demo.health,
    lastCheckTime: demo.lastCheckTime,
  }
}

export interface UseArtifactHubStatusResult {
  data: ArtifactHubStatus
  loading: boolean
  isRefreshing: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
}

export function useArtifactHubStatus(): UseArtifactHubStatusResult {
  const { data, isLoading, isRefreshing, isFailed, consecutiveFailures, isDemoFallback } =
    useCache<ArtifactHubStatus>({
      key: CACHE_KEY,
      category: 'default',
      initialData: INITIAL_DATA,
      demoData: toDemoStatus(ARTIFACT_HUB_DEMO_DATA),
      persist: true,
      fetcher: fetchArtifactHubStatus,
    })

  const effectiveIsDemoData = isDemoFallback && !isLoading
  const hasAnyData =
    data.packages > 0 ||
    data.repositories > 0 ||
    data.organizations > 0 ||
    data.users > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    isRefreshing,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    isDemoData: effectiveIsDemoData,
  })

  return {
    data,
    loading: isLoading,
    isRefreshing,
    error: isFailed && !hasAnyData,
    consecutiveFailures,
    showSkeleton,
    showEmptyState,
  }
}
