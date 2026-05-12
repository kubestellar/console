import React, { useState, useEffect, useCallback } from 'react'
import { AlertCircle, Play, RotateCcw, Zap, Key, Check, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useReportCardDataState } from '../CardDataContext'
import { isGlobalQuantumPollingPaused } from '../../../lib/quantum/pollingContext'
import { isQuantumForcedToDemo } from '../../../lib/demoMode'
import { CustomQASMModal } from './CustomQASMModal'
import { useQASMFiles } from '../../../hooks/useQASMFiles'
import { useAuth } from '../../../lib/auth'
import { useDrillDown } from '../../../hooks/useDrillDown'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'

interface ControlState {
  backend: string
  shots: number
  qasm_file: string
  executing: boolean
  loop_mode: boolean
  last_execution?: {
    job_id: string
    status: string
    timestamp: string
  }
}

interface CircuitInfo {
  num_qubits: number
  depth?: number
}

interface ControlSystem {
  command: string
  description: string
  status: string
  timestamp: string
}

interface SystemStatus {
  status: string
  running: boolean
  loop_running: boolean
  execution_mode: string
  loop_mode: boolean
  circuit_info?: CircuitInfo
  control_system?: ControlSystem
  backend_info?: {
    name: string
    shots: number
  } | null
  last_result?: {
    num_qubits: number
    shots: number
    counts: Record<string, number>
    timestamp: string
  } | null
  last_result_time?: string
  qasm_file?: string
  message: string
  version_info?: {
    version: string
    commit: string
    timestamp: string
  }
}

const LARGE_CIRCUIT_QASM = 'expt32.qasm'
const LOOP_MODE_STATUS_SYNC_DELAY_MS = 100
const EXECUTION_STATUS_POLL_DELAY_MS = 500

const DEMO_DATA: ControlState = {
  backend: 'aer',
  shots: 1024,
  qasm_file: 'expt.qasm',
  executing: false,
  loop_mode: false,
}

const DEMO_STATUS: SystemStatus = {
  status: 'ready',
  running: false,
  loop_running: false,
  execution_mode: 'control-based',
  loop_mode: false,
  circuit_info: {
    num_qubits: 2,
  },
  control_system: {
    command: 'idle',
    description: 'System idle, ready for commands',
    status: 'ready',
    timestamp: new Date().toISOString(),
  },
  backend_info: {
    name: 'aer',
    shots: 1024,
  },
  message: 'System ready',
}

export const QuantumControlPanel: React.FC = () => {
  const { t } = useTranslation('cards')
  const { isAuthenticated, login, isLoading: authIsLoading } = useAuth()
  const { open: openDrillDown, close: closeDrillDown } = useDrillDown()
  const [control, setControl] = useState<ControlState>(DEMO_DATA)
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [hasInitialized, setHasInitialized] = useState(false)

  

  // IBM Quantum credentials
  const [ibmAuthenticated, setIbmAuthenticated] = useState(false)
  const [showClearCredentialsDialog, setShowClearCredentialsDialog] = useState(false)
  const [isClearing, setIsClearing] = useState(false)

  // Custom QASM support
  const [showCustomQasmModal, setShowCustomQasmModal] = useState(false)
  const [customQasmContent, setCustomQasmContent] = useState<string>('')
  const [previousQasmFile, setPreviousQasmFile] = useState<string>(DEMO_DATA.qasm_file)

  // Fetch available QASM files
  const { files: qasmFiles, isLoading: qasmFilesLoading } = useQASMFiles()

  const isDemoFallback = consecutiveFailures >= 3

  useReportCardDataState({
    isLoading: isLoading && !isDemoFallback,
    isRefreshing,
    isDemoData: isDemoFallback,
    hasData: status !== null,
    isFailed: error !== null,
    consecutiveFailures,
  })

    // Fetch current status
  const fetchStatus = useCallback(async (isInitialLoad: boolean = false) => {
    try {
      setIsRefreshing(true)
      const res = await fetch('/api/quantum/status', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      if (!res.ok) {
      const errorBody = await res.text()
      console.error('[Quantum] Request failed:', {
          status: res.status,
          statusText: res.statusText,
          body: errorBody,
      })
      throw new Error(`Failed to fetch status (${res.status}): ${errorBody}`)
      }

      const data = await res.json()
      setStatus(data)
      setError(null)
      setConsecutiveFailures(0)

      // Fix #3: Only sync backend config on initial load, not on every poll
      // This prevents the shots value from being overwritten by user input
      if (isInitialLoad) {
      const backendInfo = data.backend_info || { name: control.backend, shots: control.shots }
      setControl(prev => ({
          ...prev,
          backend: backendInfo?.name || prev.backend,
          shots: backendInfo?.shots || prev.shots,
          loop_mode: data.loop_mode !== undefined ? data.loop_mode : prev.loop_mode,
      }))
      } else {
      // On subsequent polls, only update loop_mode, not shots
      setControl(prev => ({
          ...prev,
          loop_mode: data.loop_mode !== undefined ? data.loop_mode : prev.loop_mode,
      }))
      }
    } catch (err) {
      console.error('Error fetching status:', err)
      console.debug('[Quantum] Auth Debug:', {
      hasCredentials: true,
      url: '/api/quantum/status',
      error: err instanceof Error ? err.message : String(err),
      isOnline: navigator.onLine,
      })
      setError(err instanceof Error ? err.message : 'Unknown error')
      setConsecutiveFailures(prev => {
      const newFailures = prev + 1
      if (newFailures >= 3) {
          console.warn('[Quantum] Falling back to demo after 3 failures')
          setStatus(DEMO_STATUS)
      }
      return newFailures
      })
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])//control.backend, control.shots])

  // Fetch IBM Quantum auth status
  const fetchAuthStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/quantum/auth/status', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (res.ok) {
      const data = await res.json()
      setIbmAuthenticated(data.authenticated === true)
      }
    } catch (err) {
      console.error('Error fetching auth status:', err)
      setError('Unable to load IBM Quantum authentication status')
    }
  }, [])

  // Open IBM Quantum credentials dialog via drilldown
  const handleOpenCredentialsDialog = useCallback(() => {
    const handleSaveCredentials = async (form: { apiKey: string; crn: string }) => {
      if (!form.apiKey.trim() || !form.crn.trim()) {
        throw new Error('Both API Key and CRN are required')
      }

      const res = await fetch('/api/quantum/auth/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
        body: JSON.stringify({
          api_key: form.apiKey,
          crn: form.crn,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to save credentials')
      }

      setIbmAuthenticated(true)
    }

    openDrillDown({
      type: 'quantum-credentials',
      title: 'IBM Quantum Credentials',
      data: {
        ibmAuthenticated,
        onSave: handleSaveCredentials,
        onClose: closeDrillDown,
      },
    })
  }, [ibmAuthenticated, openDrillDown, closeDrillDown])

  // Clear IBM Quantum credentials
  const handleClearCredentials = useCallback(async () => {
    setIsClearing(true)
    try {
      const res = await fetch('/api/quantum/auth/clear', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to clear credentials')
      }

      setIbmAuthenticated(false)
      setShowClearCredentialsDialog(false)
      setError(null)
    } catch (err) {
      console.error('Error clearing credentials:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsClearing(false)
    }
  }, [])

  useEffect(() => {
    if (!showClearCredentialsDialog || isClearing) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowClearCredentialsDialog(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showClearCredentialsDialog, isClearing])

  // Initialize on mount
  useEffect(() => {
    fetchStatus(true)
    fetchAuthStatus()
    setHasInitialized(true)
  }, [])

  // Set up polling interval
  // Reduced from 1s to 2.5s to avoid aggressive polling while still being responsive
  // for loop_mode status updates
  useEffect(() => {
    if (!hasInitialized) return

    // Skip polling if paused (e.g., dashboard settings modal open) or demo forced
    if (isGlobalQuantumPollingPaused() || isQuantumForcedToDemo()) return

    const CONTROL_PANEL_POLL_MS = 8000
    const interval = setInterval(() => {
      if (!isGlobalQuantumPollingPaused() && !isQuantumForcedToDemo()) {
      fetchStatus(false)
      }
    }, CONTROL_PANEL_POLL_MS)
    return () => clearInterval(interval)
  }, [hasInitialized, fetchStatus])

  const handleExecute = async () => {
    setControl(prev => ({ ...prev, executing: true }))
    try {
      let qasmFilename = control.qasm_file

      if (control.qasm_file === 'custom') {
      const timestamp = Date.now()
      qasmFilename = `custom_${timestamp}.qasm`

      const uploadRes = await fetch('/api/quantum/qasm/file', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          credentials: 'include',
          signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
          body: JSON.stringify({
            name: qasmFilename,
            content: customQasmContent,
          }),
      })

      if (!uploadRes.ok) throw new Error('Failed to save custom QASM')
      }

      const payload: Record<string, unknown> = {
      backend: control.backend,
      shots: control.shots,
      qasm_file: qasmFilename,
      }

      const response = await fetch('/api/quantum/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      body: JSON.stringify(payload),
      })

      if (!response.ok) throw new Error('Execution failed')

      const result = await response.json()
      setControl(prev => ({
      ...prev,
      last_execution: {
          job_id: result.job_id,
          status: result.status,
          timestamp: new Date().toISOString(),
      },
      }))

      // Fix #2: Immediately poll job status to catch rapid completions
      // Only update status, don't update shots to preserve user input
      setTimeout(async () => {
      try {
          const statusRes = await fetch('/api/quantum/status', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
          })
          if (statusRes.ok) {
            const data = await statusRes.json()
            setStatus(data)
            // Only update loop_mode, preserve shots user input
            setControl(prev => ({
              ...prev,
              loop_mode: data.loop_mode !== undefined ? data.loop_mode : prev.loop_mode,
            }))
          }
      } catch (err) {
          console.error('Error polling after execution:', err)
          setError('Execution started, but status refresh failed')
      }
      }, EXECUTION_STATUS_POLL_DELAY_MS)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution error')
    } finally {
      setControl(prev => ({ ...prev, executing: false }))
    }
  }

  const handleLoopModeToggle = async () => {
    try {
      const endpoint = control.loop_mode ? '/api/quantum/loop/stop' : '/api/quantum/loop/start'
      const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      if (!response.ok) throw new Error('Failed to toggle loop mode')

      // Fix #1: Don't rely on response.loop_mode - refetch status instead
      await new Promise(resolve => setTimeout(resolve, LOOP_MODE_STATUS_SYNC_DELAY_MS))
      const statusRes = await fetch('/api/quantum/status', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (statusRes.ok) {
      const statusData = await statusRes.json()
      setStatus(statusData)
      setControl(prev => ({
          ...prev,
          loop_mode: statusData.loop_mode,
      }))
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle loop mode')
    }
  }

  if (authIsLoading) {
    return (
      <div className="p-4 space-y-3">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-40" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
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

  const displayStatus = status || DEMO_STATUS
  const isHealthy = displayStatus.status === 'ready' || displayStatus.loop_running

  return (
    <div className="p-4">
      <div className="p-4">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-blue-500" />
          Quantum Demonstration Controls
      </h3>

      {error && !isDemoFallback && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
      )}

      <div className="space-y-4">
          {/* IBM Credentials Button */}
          <button
            onClick={handleOpenCredentialsDialog}
            className="w-full px-3 py-2 flex items-center justify-between rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">IBM Credentials</span>
            </div>
            <div className={`flex items-center gap-1 text-xs font-semibold ${ibmAuthenticated ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
              {ibmAuthenticated ? (
                <>
                  <Check className="w-3 h-3" />
                  Configured
                </>
              ) : (
                'Not configured'
              )}
            </div>
          </button>

          {/* Clear Credentials Button */}
          {ibmAuthenticated && (
            <button
              onClick={() => setShowClearCredentialsDialog(true)}
              disabled={isClearing}
              className="w-full px-3 py-2 flex items-center justify-between rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                <span className="text-sm font-medium text-red-700 dark:text-red-300">Clear Credentials</span>
              </div>
            </button>
          )}

          {/* Clear Credentials Confirmation Dialog */}
          {showClearCredentialsDialog && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm mx-4 shadow-lg">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Clear Credentials?</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Are you sure you want to delete your IBM Quantum credentials? You'll need to enter them again to run circuits on IBM hardware.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowClearCredentialsDialog(false)}
                    disabled={isClearing}
                    className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleClearCredentials}
                    disabled={isClearing}
                    className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-red-400 disabled:opacity-50 text-white font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {isClearing ? 'Clearing...' : 'Clear'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Backend Selection */}
          {(() => {
            const is32Qubit = control.qasm_file === LARGE_CIRCUIT_QASM
            return (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Backend
                </label>
                <select
                  value={control.backend}
                  onChange={e => setControl(prev => ({ ...prev, backend: e.target.value }))}
                  disabled={control.executing}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm disabled:opacity-50"
                >
                  <option value="aer">{t('quantumControlPanel.backendOptions.aerSimulator')}</option>
                  <option value="sim">QASM Simulator</option>
                  <option value="qx5">IBM 5-qubit</option>
                  {ibmAuthenticated && (
                    <>
                      <option value="least">IBM Least Busy (Real Hardware)</option>
                      <option value="aer_noise" disabled={is32Qubit}>
                        Aer with Real Noise Model{is32Qubit ? ' — too memory-intensive for 32 qubits' : ''}
                      </option>
                    </>
                  )}
                </select>
                {is32Qubit && (
                  <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                    32-qubit circuits require too much memory for noisy simulation — noise model options are disabled.
                  </p>
                )}
                {!is32Qubit && control.backend === 'aer_noise' && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Simulates your least busy backend with its real noise characteristics
                  </p>
                )}
              </div>
            )
          })()}

          {/* Shots Configuration */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Shots
            </label>
            <input
              type="number"
              min="1"
              max="1024"
              value={control.shots}
              onChange={e => {
                const value = parseInt(e.target.value)
                if (!isNaN(value) && value >= 1 && value <= 1024) {
                  setControl(prev => ({ ...prev, shots: value }))
                }
              }}
              disabled={control.executing}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm disabled:opacity-50"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setControl(prev => ({ ...prev, shots: 100 }))}
                disabled={control.executing}
                className="flex-1 px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                100
              </button>
              <button
                onClick={() => setControl(prev => ({ ...prev, shots: 256 }))}
                disabled={control.executing}
                className="flex-1 px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                256
              </button>
              <button
                onClick={() => setControl(prev => ({ ...prev, shots: 512 }))}
                disabled={control.executing}
                className="flex-1 px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                512
              </button>
              <button
                onClick={() => setControl(prev => ({ ...prev, shots: 1024 }))}
                disabled={control.executing}
                className="flex-1 px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                1024
              </button>
            </div>
          </div>

          {/* QASM File */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              QASM File
            </label>
            <div className="flex gap-2">
              <select
                value={control.qasm_file}
                onChange={e => {
                  const val = e.target.value
                  if (val === 'custom') {
                    setPreviousQasmFile(control.qasm_file)
                    setShowCustomQasmModal(true)
                  } else {
                    const newBackend =
                      val === LARGE_CIRCUIT_QASM && control.backend === 'aer_noise'
                        ? 'aer'
                        : control.backend
                    setControl(prev => ({ ...prev, qasm_file: val, backend: newBackend }))
                  }
                }}
                disabled={control.executing || qasmFilesLoading}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm disabled:opacity-50"
              >
                {qasmFilesLoading ? (
                  <option>{t('quantumControlPanel.qasmFiles.loadingFiles')}</option>
                ) : (
                  <>
                    {qasmFiles.length === 0 && <option disabled>No QASM files available</option>}
                    {qasmFiles.map(file => (
                      <option key={file.name} value={file.name}>
                        {file.name}
                      </option>
                    ))}
                    {qasmFiles.length > 0 && <option disabled>─────────────────</option>}
                    <option value="custom">{t('quantumControlPanel.qasmFiles.customQasm')}</option>
                  </>
                )}
              </select>
              {control.qasm_file === 'custom' && customQasmContent && (
                <button
                  onClick={() => setShowCustomQasmModal(true)}
                  disabled={control.executing}
                  className="px-3 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                  title="Edit custom QASM"
                >
                  <svg className="w-4 h-4 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
            </div>
            {control.qasm_file === 'custom' && customQasmContent && (
              <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                ✓ Custom circuit loaded ({customQasmContent.length} bytes)
              </p>
            )}
          </div>

          {/* Loop Mode Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${control.loop_mode ? 'bg-blue-500 text-white' : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Loop Mode</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{control.loop_mode ? 'Enabled - Continuous execution' : 'Disabled - Single execution'}</p>
              </div>
            </div>
            <button
              onClick={handleLoopModeToggle}
              disabled={control.executing}
              className={`relative w-12 h-7 rounded-full transition-colors ${control.loop_mode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'} disabled:opacity-50`}
            >
              <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${control.loop_mode ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {/* Execute Button */}
          <button
            onClick={handleExecute}
            disabled={control.executing}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:opacity-50 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <Play className="w-4 h-4" />
            {control.executing ? 'Executing...' : control.loop_mode ? 'Update Parameters' : 'Execute Circuit'}
          </button>

          {/* Status Display */}
          <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">System Status</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Status:</span>
                <span className={`font-semibold ${isHealthy ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                  {displayStatus.loop_running ? 'loop_running' : displayStatus.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Running:</span>
                <span className={displayStatus.running ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}>
                  {displayStatus.running ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Mode:</span>
                <span className="text-gray-900 dark:text-gray-100 font-mono text-xs">
                  {displayStatus.execution_mode}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Loop:</span>
                <span className={`text-xs font-semibold ${displayStatus.loop_mode ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`}>
                  {displayStatus.loop_mode ? 'ON' : 'OFF'}
                </span>
              </div>
              {displayStatus.circuit_info && (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Qubits:</span>
                  <span className="text-gray-900 dark:text-gray-100 text-xs">
                    {displayStatus.circuit_info.num_qubits}
                  </span>
                </div>
              )}
              {displayStatus.control_system && (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Command:</span>
                  <span className="text-gray-900 dark:text-gray-100 text-xs">
                    {displayStatus.control_system.command}
                  </span>
                </div>
              )}
              {displayStatus.last_result_time && (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Result Time:</span>
                  <span className="text-gray-900 dark:text-gray-100 text-xs">
                    {new Date(displayStatus.last_result_time).toLocaleTimeString()}
                  </span>
                </div>
              )}
              {displayStatus.version_info && (
                <>
                  <div className="flex justify-between pt-1 border-t border-gray-300 dark:border-gray-600 mt-2">
                    <span className="text-gray-600 dark:text-gray-400">Backend Ver:</span>
                    <span className="text-gray-900 dark:text-gray-100 text-xs font-mono font-semibold">
                      {displayStatus.version_info.version}
                    </span>
                  </div>
                  {displayStatus.version_info.commit && displayStatus.version_info.commit !== 'unknown' && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Commit:</span>
                      <span className="text-gray-900 dark:text-gray-100 text-xs font-mono">
                        {displayStatus.version_info.commit}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Last Execution */}
          {control.last_execution && (
            <div className="p-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
              <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-2 flex items-center gap-1">
                <RotateCcw className="w-3 h-3" />
                Last Execution
              </p>
              <div className="space-y-1 text-xs">
                <p className="text-gray-600 dark:text-gray-400">
                  <span className="font-mono">ID:</span> {control.last_execution.job_id.substring(0, 8)}...
                </p>
                <p className="text-gray-600 dark:text-gray-400">
                  <span className="font-mono">Status:</span> {control.last_execution.status}
                </p>
                <p className="text-gray-600 dark:text-gray-400">
                  <span className="font-mono">Time:</span> {new Date(control.last_execution.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          )}
      </div>

      <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          <p className="flex items-center gap-1">
            <Zap className="w-3 h-3" />
            Control-based execution via API proxy
          </p>
      </div>

      {/* Custom QASM Modal */}
      <CustomQASMModal
          isOpen={showCustomQasmModal}
          initialContent={customQasmContent}
          onSubmit={(content) => {
            setCustomQasmContent(content)
            setControl(prev => ({ ...prev, qasm_file: 'custom' }))
            setShowCustomQasmModal(false)
          }}
          onCancel={() => {
            setControl(prev => ({ ...prev, qasm_file: previousQasmFile }))
            setShowCustomQasmModal(false)
          }}
      />
      </div>
    </div>
  )
}