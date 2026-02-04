/**
 * Mini Dashboard - PWA Widget Mode
 *
 * A compact, always-refreshing dashboard designed to be installed as a
 * Progressive Web App (PWA) for desktop monitoring.
 *
 * Install: Click browser menu → "Install app" or "Add to Desktop"
 */

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Maximize2, Settings, Download } from 'lucide-react'
import { useClusters, useGPUNodes, usePodIssues } from '../../hooks/useMCP'
import { cn } from '../../lib/cn'

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

  // Fetch data
  const { clusters, isLoading: clustersLoading, refetch: refetchClusters } = useClusters()
  const { nodes: gpuNodes, isLoading: gpuLoading, refetch: refetchGPU } = useGPUNodes()
  const { issues: podIssues, isLoading: issuesLoading, refetch: refetchIssues } = usePodIssues()

  const isLoading = clustersLoading || gpuLoading || issuesLoading

  // Calculate stats
  const totalClusters = clusters?.length || 0
  const healthyClusters = clusters?.filter((c) => c.healthy).length || 0
  const totalGPUs = gpuNodes?.reduce((sum, n) => sum + (n.gpuCount || 0), 0) || 0
  const allocatedGPUs = gpuNodes?.reduce((sum, n) => sum + (n.gpuAllocated || 0), 0) || 0
  const totalIssues = podIssues?.length || 0
  // Critical issues are those with CrashLoopBackOff, OOMKilled, or Error status
  const criticalIssues = podIssues?.filter((i) =>
    i.status === 'CrashLoopBackOff' || i.status === 'OOMKilled' || i.status === 'Error'
  ).length || 0

  // Overall health status
  const overallStatus: 'healthy' | 'warning' | 'error' =
    criticalIssues > 0 ? 'error' : totalIssues > 3 ? 'warning' : 'healthy'

  // Manual refresh
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await Promise.all([refetchClusters?.(), refetchGPU?.(), refetchIssues?.()])
    setLastUpdated(new Date())
    setIsRefreshing(false)
  }, [refetchClusters, refetchGPU, refetchIssues])

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

  // Open full dashboard in new window
  const openFullDashboard = () => {
    window.open('/dashboard', '_blank')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 text-white p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <StatusDot status={overallStatus} />
          <h1 className="text-lg font-semibold">KC Console</h1>
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

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard
          label="Clusters"
          value={totalClusters}
          color="text-purple-400"
          subValue={`${healthyClusters} healthy`}
        />
        <StatCard
          label="GPUs"
          value={totalGPUs}
          color="text-green-400"
          subValue={`${allocatedGPUs} allocated`}
        />
        <StatCard
          label="Pod Issues"
          value={totalIssues}
          color={totalIssues > 0 ? 'text-orange-400' : 'text-gray-400'}
          subValue={criticalIssues > 0 ? `${criticalIssues} critical` : undefined}
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
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs p-2 rounded bg-gray-800/50 border border-gray-700/30"
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full flex-shrink-0',
                      isCritical ? 'bg-red-500' : 'bg-orange-500'
                    )}
                  />
                  <span className="truncate text-gray-300">{issue.name}</span>
                  <span className="text-gray-500 ml-auto flex-shrink-0">{issue.reason || issue.status}</span>
                </div>
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
          <div className="text-center text-xs text-gray-500">
            {isSafariBrowser ? (
              <p>Safari: <strong>File → Add to Dock</strong> to install</p>
            ) : (
              <p>Use browser menu → "Install app" to add to desktop</p>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>KC Console Widget</span>
            <a
              href="/settings"
              className="flex items-center gap-1 hover:text-gray-400 transition-colors"
            >
              <Settings className="w-3 h-3" />
              Settings
            </a>
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
