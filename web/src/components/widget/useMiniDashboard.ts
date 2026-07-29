/**
 * useMiniDashboard – state and side-effect logic for the MiniDashboard widget.
 *
 * Extracted from MiniDashboard.tsx so the orchestrating component stays thin.
 * Houses all data-fetching, derived stats, PWA install, refresh, and notification logic.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useClusters, useGPUNodes, usePodIssues } from '../../hooks/useMCP'
import type { PodIssue } from '../../hooks/useMCP'
import { LOCAL_AGENT_HTTP_URL, FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'
import { ROUTES } from '../../config/routes'
import { agentFetch } from '../../hooks/mcp/shared'
import { POLL_INTERVAL_MS } from '../../lib/constants/network'
import { emitWidgetLoaded, emitWidgetNavigation, emitWidgetInstalled } from '../../lib/analytics'
import { sendNotificationWithDeepLink } from '../../hooks/useDeepLink'

/** UTM params appended to click-through URLs for GA4 widget campaign attribution */
const WIDGET_UTM_PARAMS = 'utm_source=widget&utm_medium=pwa&utm_campaign=widget-usage'

/** Target dimensions when resizing a standalone PWA window */
const WIDGET_WIDTH_PX = 540
const WIDGET_HEIGHT_PX = 360

/** Max nodes to name individually in the offline push notification */
const OFFLINE_NOTIFICATION_MAX_NODES = 3

/** Max pod issues to surface in the issues list */
export const MAX_ISSUES_SHOWN = 5

export interface NodeData {
  name: string
  cluster?: string
  status: string
  roles: string[]
  unschedulable?: boolean
}

// TypeScript type for the PWA install-prompt event (not yet in lib.dom.d.ts)
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Returns true when running in a Safari browser (no Chromium engine). */
export function isSafari(): boolean {
  const ua = navigator.userAgent
  return ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('Chromium')
}

/** Returns true when the page is running as an installed standalone PWA. */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export interface MiniDashboardState {
  // Derived cluster / GPU / node / pod stats
  totalClusters: number
  healthyClusters: number
  totalGPUs: number
  allocatedGPUs: number
  totalIssues: number
  offlineCount: number
  criticalIssues: number
  allNodes: NodeData[]
  podIssues: PodIssue[] | undefined
  overallStatus: 'healthy' | 'warning' | 'error'
  isLoading: boolean
  // UI state
  isRefreshing: boolean
  lastUpdated: Date | null
  isInstalled: boolean
  isSafariBrowser: boolean
  installPrompt: BeforeInstallPromptEvent | null
  // Handlers
  handleRefresh: () => Promise<void>
  handleInstall: () => Promise<void>
  openInBrowser: (path: string) => void
  openFullDashboard: () => void
}

export function useMiniDashboard(): MiniDashboardState {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(() => isStandalone())
  const [isSafariBrowser] = useState(() => isSafari())

  const { deduplicatedClusters: clusters, isLoading: clustersLoading, refetch: refetchClusters } = useClusters()
  const { nodes: gpuNodes, isLoading: gpuLoading, refetch: refetchGPU } = useGPUNodes()

  const [allNodes, setAllNodes] = useState<NodeData[]>([])
  const [nodesLoading, setNodesLoading] = useState(true)

  const fetchNodes = useCallback(async () => {
    try {
      const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/nodes`, {
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (response.ok) {
        const data = await response.json()
        setAllNodes(data.nodes || [])
      }
    } catch {
      // Agent might not be running — that's ok for the widget
    } finally {
      setNodesLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNodes()
    const interval = setInterval(fetchNodes, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchNodes])

  const offlineNodes = allNodes.filter(n => n.status !== 'Ready' || n.unschedulable === true)
  const { issues: podIssues, isLoading: issuesLoading, refetch: refetchIssues } = usePodIssues()

  const isLoading = clustersLoading || gpuLoading || issuesLoading || nodesLoading

  const totalClusters = clusters?.length || 0
  const healthyClusters = clusters?.filter(c => c.healthy).length || 0
  const totalGPUs = gpuNodes?.reduce((sum, n) => sum + (n.gpuCount || 0), 0) || 0
  const allocatedGPUs = gpuNodes?.reduce((sum, n) => sum + (n.gpuAllocated || 0), 0) || 0
  const totalIssues = podIssues?.length || 0
  const offlineCount = offlineNodes.length
  const criticalIssues =
    podIssues?.filter(
      i => i.status === 'CrashLoopBackOff' || i.status === 'OOMKilled' || i.status === 'Error'
    ).length || 0

  const overallStatus: 'healthy' | 'warning' | 'error' =
    offlineCount > 0 || criticalIssues > 0 ? 'error' : totalIssues > 3 ? 'warning' : 'healthy'

  const prevOfflineCountRef = useRef<number>(0)

  // Track widget load in GA4 and request notification permission on first render
  useEffect(() => {
    emitWidgetLoaded(isStandalone() ? 'standalone' : 'browser')
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Send a push notification when new offline nodes are detected
  useEffect(() => {
    if (offlineCount > prevOfflineCountRef.current && prevOfflineCountRef.current >= 0) {
      const newOffline = offlineCount - prevOfflineCountRef.current
      if ('Notification' in window && Notification.permission === 'granted' && newOffline > 0) {
        const firstOfflineNode = offlineNodes[0]
        const nodeNames = (offlineNodes || [])
          .slice(0, OFFLINE_NOTIFICATION_MAX_NODES)
          .map(n => n.name)
          .join(', ')

        sendNotificationWithDeepLink(
          'KubeStellar: Nodes Offline',
          `${newOffline} node${newOffline > 1 ? 's' : ''} went offline: ${nodeNames}${offlineCount > OFFLINE_NOTIFICATION_MAX_NODES ? '...' : ''}`,
          {
            drilldown: 'node',
            cluster: firstOfflineNode?.cluster || 'unknown',
            node: firstOfflineNode?.name || 'unknown',
            issue: 'Node went offline',
          },
          { tag: 'node-offline' }
        )
      }
    }
    prevOfflineCountRef.current = offlineCount
  }, [offlineCount, offlineNodes])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await Promise.all([refetchClusters?.(), refetchGPU?.(), refetchIssues?.(), fetchNodes()])
    setLastUpdated(new Date())
    setIsRefreshing(false)
  }, [refetchClusters, refetchGPU, refetchIssues, fetchNodes])

  // Auto-refresh on the same cadence as node polling
  useEffect(() => {
    const interval = setInterval(handleRefresh, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [handleRefresh])

  // Stamp lastUpdated once the first load completes
  useEffect(() => {
    if (!isLoading && !lastUpdated) {
      setLastUpdated(new Date())
    }
  }, [isLoading, lastUpdated])

  // Wire up the PWA beforeinstallprompt event and display-mode change listener
  useEffect(() => {
    if (isStandalone()) {
      setIsInstalled(true)
      setInstallPrompt(null)
      return
    }

    const handler = (e: BeforeInstallPromptEvent) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler as EventListener)

    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true)
        setInstallPrompt(null)
      }
    }
    mediaQuery.addEventListener('change', handleDisplayModeChange)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler as EventListener)
      mediaQuery.removeEventListener('change', handleDisplayModeChange)
    }
  }, [])

  // Try to resize the standalone PWA window to widget dimensions
  useEffect(() => {
    if (isStandalone() && window.resizeTo) {
      try {
        window.resizeTo(WIDGET_WIDTH_PX, WIDGET_HEIGHT_PX)
      } catch {
        // Browser may not allow resizing — that's ok
      }
    }
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const result = await installPrompt.userChoice
    if (result.outcome === 'accepted') {
      emitWidgetInstalled('pwa-prompt')
      setIsInstalled(true)
      setInstallPrompt(null)
    }
  }

  // Open a URL in the system browser (not in the PWA window) with UTM attribution.
  // Swaps localhost ↔ 127.0.0.1 so Chrome opens a new browser window instead of the PWA.
  const openInBrowser = (path: string) => {
    emitWidgetNavigation(path)
    const currentHost = window.location.host
    let targetOrigin = window.location.origin

    if (currentHost.includes('localhost')) {
      targetOrigin = window.location.origin.replace('localhost', '127.0.0.1')
    } else if (currentHost.includes('127.0.0.1')) {
      targetOrigin = window.location.origin.replace('127.0.0.1', 'localhost')
    }

    const separator = path.includes('?') ? '&' : '?'
    window.open(
      `${targetOrigin}${path}${separator}${WIDGET_UTM_PARAMS}`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  const openFullDashboard = () => {
    openInBrowser(ROUTES.HOME)
  }

  return {
    totalClusters,
    healthyClusters,
    totalGPUs,
    allocatedGPUs,
    totalIssues,
    offlineCount,
    criticalIssues,
    allNodes,
    podIssues,
    overallStatus,
    isLoading,
    isRefreshing,
    lastUpdated,
    isInstalled,
    isSafariBrowser,
    installPrompt,
    handleRefresh,
    handleInstall,
    openInBrowser,
    openFullDashboard,
  }
}
