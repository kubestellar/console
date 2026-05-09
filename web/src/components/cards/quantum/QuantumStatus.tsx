import React, { useEffect, useState } from 'react'
import { useCardLoadingState } from '../CardDataContext'
import { Skeleton } from '../../ui/Skeleton'
import { StatusBadge } from '../../ui/StatusBadge'
import { Slider } from '../../ui/Slider'
import { isGlobalQuantumPollingPaused } from '../../../lib/quantum/pollingContext'
import { isQuantumForcedToDemo } from '../../../lib/demoMode'
import { useAuth } from '../../../lib/auth'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'

// Polling interval for status updates (can be adjusted if needed)
const STATUS_POLL_MS_DEFAULT = 8000
const STATUS_POLL_MIN_MS = 2000
const STATUS_POLL_MAX_MS = 30000

interface QuantumStatusResponse {
  status: string
  running: boolean
  loop_mode: boolean
  message: string
  qasm_file: string
  last_result_time?: string
  execution_mode: string
  control_system?: {
    status: string
    command: string
    description: string
  }
  backend_info?: {
    name?: string
    shots?: number
    type?: 'simulator' | 'noise_model' | 'real'
  }
  version_info?: {
    version: string
    commit: string
    timestamp: string
  }
}

interface QuantumStatusProps {
  isDemoData?: boolean
}

const DEMO_STATUS: QuantumStatusResponse = {
  status: 'idle',
  running: false,
  loop_mode: false,
  message: 'Quantum system ready',
  qasm_file: 'demo.qasm',
  execution_mode: 'control-based',
  backend_info: {
    name: 'aer',
    shots: 1024,
    type: 'simulator',
  },
  version_info: {
    version: 'v0.2.58',
    commit: 'demo',
    timestamp: new Date().toISOString(),
  },
}

export const QuantumStatus: React.FC<QuantumStatusProps> = ({ isDemoData = false }) => {
  const { isAuthenticated, login, isLoading: authIsLoading } = useAuth()
  const [statusData, setStatusData] = useState<QuantumStatusResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFailed, setIsFailed] = useState(false)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [pollInterval, setPollInterval] = useState(STATUS_POLL_MS_DEFAULT)

  

  useEffect(() => {
    const fetchStatus = async () => {
      // Skip fetch if polling is paused (e.g., dashboard settings modal open)
      if (isGlobalQuantumPollingPaused()) return

      const forceDemo = isQuantumForcedToDemo()
      const effectiveIsDemoData = isDemoData || forceDemo

      if (effectiveIsDemoData || !isAuthenticated) {
        setStatusData(DEMO_STATUS)
        setIsLoading(false)
        return
      }

      try {
        const response = await fetch('/api/quantum/status', {
          signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
        })
        if (!response.ok) {
          setIsFailed(true)
          setConsecutiveFailures((prev) => prev + 1)
          setStatusData(DEMO_STATUS)
          return
        }
        const data = await response.json()
        setStatusData(data)
        setIsFailed(false)
        setConsecutiveFailures(0)
      } catch (error) {
        console.error('Failed to fetch quantum status:', error)
        setIsFailed(true)
        setConsecutiveFailures((prev) => prev + 1)
        setStatusData(DEMO_STATUS)
      } finally {
        setIsLoading(false)
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, pollInterval)
    return () => clearInterval(interval)
  }, [isDemoData, isAuthenticated, pollInterval, isQuantumForcedToDemo])

  if (authIsLoading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton variant="text" width="80%" height={20} />
        <Skeleton variant="text" width="60%" height={20} />
        <Skeleton variant="text" width="70%" height={20} />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-4 text-center">
        <p className="text-gray-500">Please log in to view quantum data</p>
        <button
          onClick={login}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        >
          Continue with GitHub
        </button>
      </div>
    )
  }

  const effectiveIsDemoData = isDemoData || isQuantumForcedToDemo()
  const { showSkeleton } = useCardLoadingState({
    isLoading: isLoading && statusData === null,
    hasAnyData: statusData !== null,
    isFailed,
    consecutiveFailures,
    isDemoData: effectiveIsDemoData,
    isRefreshing: false,
  })

  if (showSkeleton) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton variant="text" width="80%" height={20} />
        <Skeleton variant="text" width="60%" height={20} />
        <Skeleton variant="text" width="70%" height={20} />
      </div>
    )
  }

  if (!statusData) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p>Unable to load quantum status</p>
      </div>
    )
  }

  const getStatusColor = (status: string): 'green' | 'blue' | 'yellow' => {
    switch (status?.toLowerCase()) {
      case 'loop_running':
      case 'running':
        return 'green'
      case 'idle':
      case 'stopped':
        return 'blue'
      default:
        return 'yellow'
    }
  }

  return (
    <div className="p-4 space-y-4">
        {/* Refresh Interval Control */}
        <div className="bg-secondary/30 rounded-lg p-3 border border-border">
          <Slider
            label="Refresh Interval"
            value={pollInterval}
            onChange={(e) => setPollInterval(Number(e.currentTarget.value))}
            min={STATUS_POLL_MIN_MS}
            max={STATUS_POLL_MAX_MS}
            step={500}
            unit=" ms"
          />
        </div>

        {/* Status Overview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <StatusBadge color={getStatusColor(statusData.status)} size="sm">
              {statusData.status}
            </StatusBadge>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Execution Mode</span>
            <span className="text-sm font-medium">{statusData.execution_mode}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Loop Mode</span>
            <StatusBadge color={statusData.loop_mode ? 'green' : 'gray'} size="sm">
              {statusData.loop_mode ? 'Active' : 'Inactive'}
            </StatusBadge>
          </div>
        </div>

        <div className="border-t border-border pt-3" />

        {/* Circuit Info */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Circuit File</span>
            <span className="text-sm font-mono">{statusData.qasm_file}</span>
          </div>

          {statusData.backend_info?.name && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Backend</span>
                <span className="text-sm font-mono">{statusData.backend_info.name}</span>
              </div>

              {statusData.backend_info.type && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Type</span>
                  <StatusBadge
                    color={
                      statusData.backend_info.type === 'real'
                        ? 'green'
                        : statusData.backend_info.type === 'noise_model'
                          ? 'orange'
                          : 'blue'
                    }
                    size="sm"
                    variant="outline"
                  >
                    {statusData.backend_info.type === 'real'
                      ? 'Real Hardware'
                      : statusData.backend_info.type === 'noise_model'
                        ? 'Noise Model'
                        : 'Simulator'}
                  </StatusBadge>
                </div>
              )}

              {statusData.backend_info.shots && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Shots</span>
                  <span className="text-sm font-medium">{statusData.backend_info.shots}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Control System Status */}
        {statusData.control_system && (
          <>
            <div className="border-t border-border pt-3" />
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">Control System</div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Command</span>
                <span className="text-sm font-medium">{statusData.control_system.command}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <StatusBadge color="purple" size="sm" variant="outline">
                  {statusData.control_system.status}
                </StatusBadge>
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                {statusData.control_system.description}
              </p>
            </div>
          </>
        )}

        {/* Version Info */}
        {statusData.version_info && (
          <>
            <div className="border-t border-border pt-3" />
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Version</span>
                <span className="text-xs font-mono font-semibold">{statusData.version_info.version}</span>
              </div>
              {statusData.version_info.commit && statusData.version_info.commit !== 'unknown' && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Commit</span>
                  <span className="text-xs font-mono text-muted-foreground">{statusData.version_info.commit}</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Last Update */}
        {statusData.last_result_time && (
          <>
            <div className="border-t border-border pt-3" />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Last Update</span>
              <span className="text-xs font-mono text-muted-foreground">
                {new Date(statusData.last_result_time).toLocaleTimeString()}
              </span>
            </div>
          </>
        )}

        {/* Message */}
        {statusData.message && (
          <div className="bg-secondary/50 rounded px-3 py-2">
            <p className="text-xs text-muted-foreground">{statusData.message}</p>
          </div>
        )}
      </div>
    )
  }