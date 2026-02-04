/**
 * Mini Dashboard - PWA Widget Mode
 *
 * A compact, always-refreshing dashboard designed to be installed as a
 * Progressive Web App (PWA) for desktop monitoring.
 *
 * Install: Click browser menu → "Install app" or "Add to Desktop"
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { RefreshCw, Maximize2, Download } from 'lucide-react'
import { useClusters, useGPUNodes, usePodIssues } from '../../hooks/useMCP'
import { cn } from '../../lib/cn'

// Node data type from agent
interface NodeData {
  name: string
  cluster?: string
  status: string
  roles: string[]
  unschedulable?: boolean
}

// Stat card component
function StatCard({
  label,
  value,
  color,
  subValue,
  onClick,
}: {
  label: string
  value: string | number
  color: string
  subValue?: string
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'flex flex-col items-center justify-center p-3 rounded-lg',
        'bg-gray-800/50 border border-gray-700/50',
        'transition-all duration-200',
        onClick && 'hover:bg-gray-700/50 hover:border-gray-600 cursor-pointer'
      )}
    >
      <span className={cn('text-2xl font-bold', color)}>{value}</span>
      <span className="text-xs text-gray-400 mt-1">{label}</span>
      {subValue && <span className="text-[10px] text-gray-500">{subValue}</span>}
    </button>
  )
}

// Status indicator
function StatusDot({ status }: { status: 'healthy' | 'warning' | 'error' }) {
  const colors = {
    healthy: 'bg-green-500',
    warning: 'bg-yellow-500',
    error: 'bg-red-500',
  }
  return (
    <span className={cn('w-2 h-2 rounded-full inline-block animate-pulse', colors[status])} />
  )
}

// Detect Safari browser
function isSafari(): boolean {
  const ua = navigator.userAgent
  return ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('Chromium')
}

// Detect if running as standalone (installed PWA or Add to Dock)
function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function MiniDashboard() {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isSafariBrowser] = useState(() => isSafari())

  // Fetch data from MCP hooks
  const { clusters, isLoading: clustersLoading, refetch: refetchClusters } = useClusters()
  const { nodes: gpuNodes, isLoading: gpuLoading, refetch: refetchGPU } = useGPUNodes()

  // Fetch nodes from local agent for offline detection
  const [allNodes, setAllNodes] = useState<NodeData[]>([])
  const [nodesLoading, setNodesLoading] = useState(true)

  const fetchNodes = useCallback(async () => {
    try {
      const response = await fetch('http://127.0.0.1:8585/nodes')
      if (response.ok) {
        const data = await response.json()
        setAllNodes(data.nodes || [])
      }
    } catch {
      // Agent might not be running - that's ok for widget
    } finally {
      setNodesLoading(false)
    }
  }, [])

  // Initial fetch and subscribe to updates
  useEffect(() => {
    fetchNodes()
    const interval = setInterval(fetchNodes, 30000)
    return () => clearInterval(interval)
  }, [fetchNodes])

  // Calculate offline nodes (not Ready or unschedulable)
  const offlineNodes = useMemo(() => {
    return allNodes.filter(n => n.status !== 'Ready' || n.unschedulable === true)
  }, [allNodes])
  const { issues: podIssues, isLoading: issuesLoading, refetch: refetchIssues } = usePodIssues()

  const isLoading = clustersLoading || gpuLoading || issuesLoading || nodesLoading

  // Calculate stats
  const totalClusters = clusters?.length || 0
  const healthyClusters = clusters?.filter((c) => c.healthy).length || 0
  const totalGPUs = gpuNodes?.reduce((sum, n) => sum + (n.gpuCount || 0), 0) || 0
  const allocatedGPUs = gpuNodes?.reduce((sum, n) => sum + (n.gpuAllocated || 0), 0) || 0
  const totalIssues = podIssues?.length || 0
  const offlineCount = offlineNodes.length
  // Critical issues are those with CrashLoopBackOff, OOMKilled, or Error status
  const criticalIssues = podIssues?.filter((i) =>
    i.status === 'CrashLoopBackOff' || i.status === 'OOMKilled' || i.status === 'Error'
  ).length || 0

  // Overall health status - include offline nodes
  const overallStatus: 'healthy' | 'warning' | 'error' =
    offlineCount > 0 || criticalIssues > 0 ? 'error' : totalIssues > 3 ? 'warning' : 'healthy'

  // Track previous offline count for notifications
  const prevOfflineCountRef = useRef<number>(0)

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Send notification when new offline nodes detected
  useEffect(() => {
    if (offlineCount > prevOfflineCountRef.current && prevOfflineCountRef.current >= 0) {
      const newOffline = offlineCount - prevOfflineCountRef.current
      if ('Notification' in window && Notification.permission === 'granted' && newOffline > 0) {
        const nodeNames = offlineNodes.slice(0, 3).map(n => n.name).join(', ')
        new Notification('KubeStellar: Nodes Offline', {
          body: `${newOffline} node${newOffline > 1 ? 's' : ''} went offline: ${nodeNames}${offlineCount > 3 ? '...' : ''}`,
          icon: '/kubestellar-logo.svg',
          tag: 'node-offline', // Prevents duplicate notifications
          requireInteraction: true, // Keeps notification until dismissed
        })
      }
    }
    prevOfflineCountRef.current = offlineCount
  }, [offlineCount, offlineNodes])

  // Manual refresh
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await Promise.all([refetchClusters?.(), refetchGPU?.(), refetchIssues?.(), fetchNodes()])
    setLastUpdated(new Date())
    setIsRefreshing(false)
  }, [refetchClusters, refetchGPU, refetchIssues, fetchNodes])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(handleRefresh, 30000)
    return () => clearInterval(interval)
  }, [handleRefresh])

  // Update lastUpdated when data loads
  useEffect(() => {
    if (!isLoading && !lastUpdated) {
      setLastUpdated(new Date())
    }
  }, [isLoading, lastUpdated])

  // PWA install prompt
  useEffect(() => {
    const handler = (e: BeforeInstallPromptEvent) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler as EventListener)

    // Check if already installed (standalone mode or Safari's navigator.standalone)
    if (isStandalone()) {
      setIsInstalled(true)
    }

    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const result = await installPrompt.userChoice
    if (result.outcome === 'accepted') {
      setIsInstalled(true)
      setInstallPrompt(null)
    }
  }

  // Open URL in system browser (not in PWA)
  // Uses full URL with noopener to force external browser
  const openInBrowser = useCallback((path: string) => {
    const fullUrl = `${window.location.origin}${path}`
    // Create a temporary link with target="_blank" and rel="noopener"
    // This forces the system to open in default browser
    const link = document.createElement('a')
    link.href = fullUrl
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [])

  // Open full dashboard in new window
  const openFullDashboard = () => {
    openInBrowser('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 text-white p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <StatusDot status={overallStatus} />
          <h1 className="text-lg font-semibold">KubeStellar Console</h1>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-gray-500">
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
          </button>
          <button
            onClick={openFullDashboard}
            className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors"
            title="Open full dashboard"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats Grid - 3 columns for 6 stats - clickable to navigate to full console */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <StatCard
          label="Clusters"
          value={totalClusters}
          color="text-purple-400"
          subValue={`${healthyClusters} healthy`}
          onClick={() => openInBrowser('/clusters')}
        />
        <StatCard
          label="GPUs"
          value={`${allocatedGPUs}/${totalGPUs}`}
          color="text-green-400"
          subValue="allocated/total"
          onClick={() => openInBrowser('/compute?card=gpu_overview')}
        />
        <StatCard
          label="Nodes Offline"
          value={offlineCount}
          color={offlineCount > 0 ? 'text-red-400' : 'text-green-400'}
          subValue={offlineCount > 0 ? 'needs attention' : 'all online'}
          onClick={() => openInBrowser('/nodes')}
        />
        <StatCard
          label="Pod Issues"
          value={totalIssues}
          color={totalIssues > 0 ? 'text-orange-400' : 'text-gray-400'}
          subValue={criticalIssues > 0 ? `${criticalIssues} critical` : undefined}
          onClick={() => openInBrowser('/pods?card=pod_issues')}
        />
        <StatCard
          label="Nodes"
          value={allNodes.length}
          color="text-blue-400"
          subValue={`${allNodes.length - offlineCount} ready`}
          onClick={() => openInBrowser('/nodes')}
        />
        <StatCard
          label="Status"
          value={overallStatus === 'healthy' ? 'OK' : overallStatus === 'warning' ? 'Warn' : 'Alert'}
          color={
            overallStatus === 'healthy'
              ? 'text-green-400'
              : overallStatus === 'warning'
              ? 'text-yellow-400'
              : 'text-red-400'
          }
          onClick={() => openInBrowser('/dashboard')}
        />
      </div>

      {/* Issues List (if any) */}
      {totalIssues > 0 && (
        <div className="mb-4">
          <h2 className="text-xs font-medium text-gray-400 mb-2">Recent Issues</h2>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {podIssues?.slice(0, 5).map((issue, i) => {
              const isCritical = issue.status === 'CrashLoopBackOff' || issue.status === 'OOMKilled' || issue.status === 'Error'
              return (
                <button
                  key={i}
                  onClick={() => openInBrowser(`/pods?search=${encodeURIComponent(issue.name)}`)}
                  className="w-full flex items-center gap-2 text-xs p-2 rounded bg-gray-800/50 border border-gray-700/30 hover:bg-gray-700/50 hover:border-gray-600 transition-colors text-left"
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full flex-shrink-0',
                      isCritical ? 'bg-red-500' : 'bg-orange-500'
                    )}
                  />
                  <span className="truncate text-gray-300">{issue.name}</span>
                  <span className="text-gray-500 ml-auto flex-shrink-0">{issue.reason || issue.status}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Footer / Install Prompt */}
      <div className="fixed bottom-0 left-0 right-0 p-3 bg-gray-900/90 border-t border-gray-800">
        {!isInstalled && installPrompt ? (
          <button
            onClick={handleInstall}
            className="w-full py-2 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4" />
            Install as Desktop Widget
          </button>
        ) : !isInstalled ? (
          <div className="text-center text-xs text-gray-500 space-y-1">
            {isSafariBrowser ? (
              <p>Safari: <strong>File → Add to Dock</strong> to install</p>
            ) : (
              <>
                <p className="text-yellow-500/80">⚠️ Install from THIS page for the mini widget</p>
                <p>Click the install icon <span className="inline-block px-1 py-0.5 bg-gray-700 rounded text-[10px]">⊕</span> in your address bar</p>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>KubeStellar Console Widget</span>
            <button
              onClick={openFullDashboard}
              className="flex items-center gap-1 hover:text-gray-400 transition-colors"
            >
              <Maximize2 className="w-3 h-3" />
              Open Full Dashboard
            </button>
          </div>
        )}
      </div>

      {/* Padding for fixed footer */}
      <div className="h-16" />
    </div>
  )
}

// TypeScript type for the install prompt event
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default MiniDashboard
