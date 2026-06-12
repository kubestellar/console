import React, { useState, useEffect, useCallback, useRef } from 'react'
import { AlertCircle, Check, Key, Loader2, Play, RefreshCw, ShieldCheck, Trash2, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { useReportCardDataState } from '../CardDataContext'
import { isQuantumForcedToDemo } from '../../../lib/demoMode'
import { CustomQASMModal } from './CustomQASMModal'
import { useQASMFiles } from '../../../hooks/useQASMFiles'
import { useAuth } from '../../../lib/auth'
import { useDrillDown } from '../../../hooks/useDrillDown'
import { useModal } from '../../../hooks/useModal'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import { classifyApiError } from '../../../lib/errorHandling'
import {
  useQuantumSystemStatus,
  useQuantumAuthStatus,
  DEMO_QUANTUM_STATUS,
  QUANTUM_STATUS_DEFAULT_POLL_MS,
  type QuantumSystemStatus,
} from '../../../hooks/useCachedQuantum'
import { useToast } from '../../ui/Toast'
import { ConfirmDialog } from '../../../lib/modals/ConfirmDialog'

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

type SystemStatus = QuantumSystemStatus

const LARGE_CIRCUIT_QASM = 'expt32.qasm'
const LOOP_MODE_STATUS_SYNC_DELAY_MS = 100
const EXECUTION_STATUS_POLL_DELAY_MS = 500
const CONTROL_PANEL_POLL_MS = QUANTUM_STATUS_DEFAULT_POLL_MS

// Backends that talk to IBM Quantum's upstream API. `aer` and `sim` run
// purely locally on the quantum-kc-demo pod; the three below all hit IBM
// and so are the only ones for which `/api/quantum/auth/status` is meaningful.
const BACKENDS_REQUIRING_IBM: ReadonlySet<string> = new Set(['qx5', 'least', 'aer_noise'])

const DEMO_DATA: ControlState = {
  backend: 'aer',
  shots: 1024,
  qasm_file: 'bell.qasm',
  executing: false,
  loop_mode: false,
}

const DEMO_STATUS: SystemStatus = DEMO_QUANTUM_STATUS

// Build the standard header set for quantum mutation requests. When a
// localStorage JWT is present (token-mode auth), include it as a Bearer
// token. OAuth-mode users authenticate via the HttpOnly kc_auth cookie
// that the browser sends automatically — the proxy honors both.
function buildQuantumMutationHeaders(token: string | null): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

export const QuantumControlPanel: React.FC = () => {
  const { t } = useTranslation(['cards', 'common'])
  const { showToast } = useToast()
  const { isAuthenticated, login, isLoading: authIsLoading, token } = useAuth()
  const { open: openDrillDown, close: closeDrillDown } = useDrillDown()
  const [control, setControl] = useState<ControlState>(DEMO_DATA)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [showClearCredentialsDialog, setShowClearCredentialsDialog] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [statusTab, setStatusTab] = useState<'system' | 'job'>('system')
  // Marks the wall-clock time of the last `authenticated:true` we observed in
  // THIS browser session. Persisted cache entries from a prior session don't
  // count — after a pod restart or page reload we want to drop back to
  // "Stored" until validation succeeds again.
  const [sessionValidatedAt, setSessionValidatedAt] = useState<number | null>(null)

  // Custom QASM support
  const customQasmModal = useModal()
  const [customQasmContent, setCustomQasmContent] = useState<string>('')
  const [previousQasmFile, setPreviousQasmFile] = useState<string>(DEMO_DATA.qasm_file)

  const forceDemo = isQuantumForcedToDemo()
  const hasInitializedControlRef = useRef(false)
  const requiresIBM = BACKENDS_REQUIRING_IBM.has(control.backend)

  // Fetch available QASM files
  const { files: qasmFiles, isLoading: qasmFilesLoading } = useQASMFiles(undefined, forceDemo)
  const {
    data: status,
    isLoading,
    isRefreshing,
    isDemoData: isDemoFallback,
    error: statusError,
    isFailed: isStatusFailed,
    consecutiveFailures,
    refetch: refetchStatus,
  } = useQuantumSystemStatus({
    isAuthenticated,
    forceDemo,
    pollInterval: CONTROL_PANEL_POLL_MS,
  })
  const {
    data: authStatus,
    isRefreshing: isAuthRefreshing,
    error: authStatusError,
    refetch: refetchAuthStatus,
  } = useQuantumAuthStatus({
    isAuthenticated,
    forceDemo,
    pollInterval: CONTROL_PANEL_POLL_MS,
    autoRefresh: requiresIBM,
  })

  const ibmAuthenticated = authStatus.authenticated
  const ibmTokenStored = authStatus.tokenStored
  const lastIbmError = authStatus.lastIbmError

  // Mark the session as validated whenever a successful auth check returns
  // authenticated:true. This is what flips the badge from "Stored" → "Configured".
  useEffect(() => {
    if (ibmAuthenticated && !isAuthRefreshing) {
      setSessionValidatedAt(Date.now())
    }
  }, [ibmAuthenticated, isAuthRefreshing])

  // Split the auth-status error from the rest. Transient IBM upstream errors
  // (rate-limited / 5xx / timeout / "max retries attempted") shouldn't paint
  // the panel red — those go to a softer yellow banner. Genuine fatal errors
  // (401 with no transient signature, etc.) still surface as red — but only
  // when the selected backend actually needs IBM. On a local-only backend
  // (aer/sim) a stale 401/403 from a prior IBM selection shouldn't paint the
  // panel red while the user is doing purely local work.
  //
  // Classification source:
  //   1. Prefer the workload's structured `lastIbmError` (v0.4.0+). The
  //      backend has the raw exception and classifies it authoritatively.
  //   2. Fall back to client-side `classifyApiError` against the error
  //      string when the workload didn't provide `lastIbmError` (older
  //      images, network-level failures before the body parses).
  const fatalError = mutationError ?? statusError
  const classifiedFromMessage = authStatusError ? classifyApiError(authStatusError) : null
  // Guard with `!= null` (covers `undefined` from stale pre-v0.4 cache hydration)
  // rather than `!== null`. The fetcher coerces fresh responses to `null`, but
  // cached payloads written before the field existed surface as `undefined`.
  const isAuthErrorTransient =
    lastIbmError != null
      ? lastIbmError.retryable === true
      : classifiedFromMessage?.retryable === true
  const hasAuthError = lastIbmError != null || classifiedFromMessage !== null
  const authErrorForBanner =
    hasAuthError && !isAuthErrorTransient && requiresIBM
      ? (lastIbmError?.message ?? authStatusError)
      : null
  const error = fatalError ?? authErrorForBanner

  // Three-state credential badge, driven by the workload's explicit
  // `tokenStored` field (v0.4.0+ — see web/src/hooks/useCachedQuantum.ts):
  //   configured — validation succeeded in this browser session.
  //   stored     — workload reports a token saved (auth.json on emptyDir
  //                OR Qiskit account file on the PV) but we have not
  //                validated it this session.
  //   none       — workload reports no token saved.
  //
  // Pre-v0.4 workloads omit `tokenStored`; the fetcher coerces the missing
  // field to `false`, so the badge sits at "Not configured" until the
  // first successful validation, which is harmless and self-healing.
  const ibmCredentialState: 'configured' | 'stored' | 'none' =
    sessionValidatedAt !== null
      ? 'configured'
      : ibmTokenStored
        ? 'stored'
        : 'none'

  useReportCardDataState({
    isLoading: isAuthenticated ? isLoading && status === null : false,
    isRefreshing: isRefreshing || isAuthRefreshing,
    isDemoData: isAuthenticated ? isDemoFallback : false,
    hasData: isAuthenticated ? status !== null : false,
    isFailed: isStatusFailed || fatalError !== null,
    consecutiveFailures,
  })

  useEffect(() => {
    if (!isAuthenticated || !status) {
      hasInitializedControlRef.current = false
      return
    }

    if (!hasInitializedControlRef.current) {
      setControl(prev => {
        const backendInfo = status.backend_info || { name: prev.backend, shots: prev.shots }
        return {
          ...prev,
          backend: backendInfo?.name || prev.backend,
          shots: backendInfo?.shots || prev.shots,
          loop_mode: status.loop_mode !== undefined ? status.loop_mode : prev.loop_mode,
        }
      })
      hasInitializedControlRef.current = true
      return
    }

    setControl(prev => {
      const newLoopMode = status.loop_mode !== undefined ? status.loop_mode : prev.loop_mode
      if (prev.loop_mode === newLoopMode) return prev
      return { ...prev, loop_mode: newLoopMode }
    })
  }, [isAuthenticated, status])

  // Open IBM Quantum credentials dialog via drilldown
  const handleOpenCredentialsDialog = useCallback(() => {
    const handleSaveCredentials = async (form: { apiKey: string; crn: string }) => {
      if (!form.apiKey.trim() || !form.crn.trim()) {
        throw new Error(t('quantumControlPanel.credentialFieldsRequired'))
      }

      const res = await fetch('/api/quantum/auth/save', {
        method: 'POST',
        headers: buildQuantumMutationHeaders(token),
        credentials: 'include',
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
        body: JSON.stringify({
          api_key: form.apiKey,
          crn: form.crn,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || t('quantumControlPanel.saveCredentialsFailed'))
      }

      setMutationError(null)
      await refetchAuthStatus()
      showToast(t('quantumControlPanel.ibmCredentialsSaved'), 'success')
    }

    openDrillDown({
      type: 'quantum-credentials',
      title: t('quantumControlPanel.ibmCredentialsTitle'),
      data: {
        ibmAuthenticated,
        onSave: handleSaveCredentials,
        onClose: closeDrillDown,
      },
    })
  }, [ibmAuthenticated, openDrillDown, closeDrillDown, refetchAuthStatus, showToast, t, token])

  // Clear IBM Quantum credentials
  const handleClearCredentials = useCallback(async () => {
    setIsClearing(true)
    try {
      const res = await fetch('/api/quantum/auth/clear', {
        method: 'DELETE',
        headers: buildQuantumMutationHeaders(token),
        credentials: 'include',
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || t('quantumControlPanel.clearCredentialsFailed'))
      }

      setSessionValidatedAt(null)
      await refetchAuthStatus()
      setShowClearCredentialsDialog(false)
      setMutationError(null)
      showToast(t('quantumControlPanel.ibmCredentialsCleared'), 'success')
    } catch (err) {
      console.error('Error clearing credentials:', err)
      setMutationError(err instanceof Error ? err.message : t('quantumControlPanel.unknownError'))
    } finally {
      setIsClearing(false)
    }
  }, [refetchAuthStatus, showToast, t, token])

  useEffect(() => {
    if (!showClearCredentialsDialog || isClearing) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowClearCredentialsDialog(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showClearCredentialsDialog, isClearing])

  const handleExecute = async () => {
    setIsExecuting(true)
    setMutationError(null)
    setControl(prev => ({ ...prev, executing: true }))
    try {
      let qasmFilename = control.qasm_file

      if (control.qasm_file === 'custom') {
      const timestamp = Date.now()
      qasmFilename = `custom_${timestamp}.qasm`

      const uploadRes = await fetch('/api/quantum/qasm/file', {
          method: 'POST',
          headers: buildQuantumMutationHeaders(token),
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
      headers: buildQuantumMutationHeaders(token),
      credentials: 'include',
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      body: JSON.stringify(payload),
      })

      if (!response.ok) {
        // Log the response body for diagnostics, but keep the user-facing
        // message generic (it may include upstream error pages or stack
        // traces that should not surface in the UI).
        const errBody = await response.text().catch(() => '')
        if (errBody) {
          console.error('[QuantumControlPanel] execute failed', { status: response.status, body: errBody })
        }
        throw new Error(`Execution failed (HTTP ${response.status})`)
      }

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
          await refetchStatus()
          setMutationError(null)
      } catch (err) {
          console.error('Error polling after execution:', err)
          setMutationError(t('quantumControlPanel.executionRefreshFailed'))
      }
      }, EXECUTION_STATUS_POLL_DELAY_MS)
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : t('quantumControlPanel.executionError'))
    } finally {
      setControl(prev => ({ ...prev, executing: false }))
      setIsExecuting(false)
    }
  }

  const handleLoopModeToggle = async () => {
    setMutationError(null)
    try {
      const endpoint = control.loop_mode ? '/api/quantum/loop/stop' : '/api/quantum/loop/start'
      const response = await fetch(endpoint, {
      method: 'POST',
      headers: buildQuantumMutationHeaders(token),
      credentials: 'include',
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      if (!response.ok) throw new Error(t('quantumControlPanel.loopModeToggleFailed'))

      // Fix #1: Don't rely on response.loop_mode - refetch status instead
      await new Promise(resolve => setTimeout(resolve, LOOP_MODE_STATUS_SYNC_DELAY_MS))
      await refetchStatus()
      setMutationError(null)
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : t('quantumControlPanel.loopModeToggleFailed'))
    }
  }

  // Stable callbacks for CustomQASMModal to prevent re-render cascades
  const handleCustomQasmSubmit = useCallback((content: string) => {
    setCustomQasmContent(content)
    setControl(prev => ({ ...prev, qasm_file: 'custom' }))
    customQasmModal.close()
    showToast(t('quantumControlPanel.customQasmSaved'), 'success')
  }, [customQasmModal, showToast, t])

  const handleCustomQasmCancel = useCallback(() => {
    setControl(prev => ({ ...prev, qasm_file: previousQasmFile }))
    customQasmModal.close()
  }, [customQasmModal, previousQasmFile])

  const displayStatus = status || DEMO_STATUS
  const isHealthy = displayStatus.status === 'ready' || displayStatus.loop_running === true

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

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-blue-500" />
          Quantum Demonstration Controls
      </h3>

      {error && !isDemoFallback && (
          <div
            data-testid="quantum-control-panel-fatal-banner"
            role="alert"
            className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
      )}

      {isAuthErrorTransient && requiresIBM && !isDemoFallback && (
          <div
            data-testid="quantum-control-panel-transient-banner"
            role="status"
            className="mb-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              {t('quantumControlPanel.ibmUpstreamUnavailable')}
            </p>
          </div>
      )}

      <div className="space-y-4">
          {/* IBM Credentials Button with Clear Option */}
          <div className="flex gap-2 items-stretch">
            <button
              onClick={handleOpenCredentialsDialog}
              className="flex-1 px-3 py-2 flex items-center justify-between rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('quantumControlPanel.ibmCredentialsLabel')}</span>
              </div>
              <div className={cn('flex items-center gap-1 text-xs font-semibold',
                ibmCredentialState === 'configured' && 'text-green-600 dark:text-green-400',
                ibmCredentialState === 'stored' && 'text-blue-600 dark:text-blue-400',
                ibmCredentialState === 'none' && 'text-gray-500 dark:text-gray-400',
              )}>
                {ibmCredentialState === 'configured' && (
                  <>
                    <ShieldCheck className="w-3 h-3" />
                    {t('quantumControlPanel.credsConfigured')}
                  </>
                )}
                {ibmCredentialState === 'stored' && (
                  <>
                    <Check className="w-3 h-3" />
                    {t('quantumControlPanel.credsStored')}
                  </>
                )}
                {ibmCredentialState === 'none' && t('quantumControlPanel.credsNone')}
              </div>
            </button>
            {ibmCredentialState === 'stored' && (
              <button
                onClick={() => { void refetchAuthStatus() }}
                disabled={isAuthRefreshing}
                className="px-3 py-2 rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50 flex items-center"
                title={t('quantumControlPanel.validateNow')}
                aria-label={t('quantumControlPanel.validateNow')}
              >
                <RefreshCw className={cn('w-4 h-4 text-blue-600 dark:text-blue-400', isAuthRefreshing && 'animate-spin')} />
              </button>
            )}
            {ibmCredentialState !== 'none' && (
              <button
                onClick={() => setShowClearCredentialsDialog(true)}
                disabled={isClearing}
                className="px-3 py-2 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50 flex items-center"
                title={t('quantumControlPanel.clearCredentials')}
              >
                <Trash2 className={`w-4 h-4 ${isClearing ? 'text-gray-400' : 'text-red-600 dark:text-red-400'}`} />
              </button>
            )}
          </div>

          <ConfirmDialog
            isOpen={showClearCredentialsDialog}
            onClose={() => setShowClearCredentialsDialog(false)}
            onConfirm={handleClearCredentials}
            title={t('quantumControlPanel.clearCredentialsTitle')}
            message={t('quantumControlPanel.clearCredentialsMessage')}
            confirmLabel={t('quantumControlPanel.clearCredentials')}
            cancelLabel={t('common:actions.cancel')}
            variant="danger"
            isLoading={isClearing}
          />

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
                  {ibmCredentialState !== 'none' && (
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
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
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
              className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs disabled:opacity-50"
            />
            <button
              onClick={() => setControl(prev => ({ ...prev, shots: 100 }))}
              disabled={control.executing}
              className="px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              100
            </button>
            <button
              onClick={() => setControl(prev => ({ ...prev, shots: 256 }))}
              disabled={control.executing}
              className="px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              256
            </button>
            <button
              onClick={() => setControl(prev => ({ ...prev, shots: 512 }))}
              disabled={control.executing}
              className="px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              512
            </button>
            <button
              onClick={() => setControl(prev => ({ ...prev, shots: 1024 }))}
              disabled={control.executing}
              className="px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              1024
            </button>
          </div>

          {/* QASM File */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('cards:quantumControlPanel.qasmFileLabel')}
            </label>
            <div className="flex gap-2">
              <select
                value={control.qasm_file}
                onChange={e => {
                  const val = e.target.value
                  if (val === 'custom') {
                    setPreviousQasmFile(control.qasm_file)
                    customQasmModal.open()
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
                  onClick={customQasmModal.open}
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
          {/* Execute Button + Loop Mode Toggle */}
          <div className="flex gap-2">
            <button
              onClick={handleExecute}
              disabled={control.executing || isExecuting}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
            >
              {(control.executing || isExecuting) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              <span className="text-sm">{(control.executing || isExecuting) ? 'Executing...' : control.loop_mode ? 'Update Parameters' : 'Execute Circuit'}</span>
            </button>
            <button
              onClick={handleLoopModeToggle}
              disabled={control.executing}
              className={cn(
                'px-3 py-2 rounded-lg border transition-colors flex items-center gap-2',
                control.loop_mode
                  ? 'bg-blue-600 border-blue-700 text-white hover:bg-blue-700'
                  : 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              )}
              title={control.loop_mode ? 'Disable loop mode' : 'Enable loop mode — continuous execution'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-xs font-medium">{control.loop_mode ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          {/* Status Display with Tabs */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-hidden">
            {/* Tab Headers */}
            <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setStatusTab('system')}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  statusTab === 'system'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-b-2 border-blue-500'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                System Status
              </button>
              <button
                onClick={() => setStatusTab('job')}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  statusTab === 'job'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-b-2 border-blue-500'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                Last Job
              </button>
            </div>

            {/* Tab Content */}
            <div className="p-3">
              {statusTab === 'system' ? (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Status:</span>
                    <span className={`font-semibold ${isHealthy ? 'text-green-400' : 'text-yellow-400'}`}>
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
              ) : (
                <div className="space-y-1 text-xs">
                  {control.last_execution ? (
                    <>
                      <p className="text-gray-600 dark:text-gray-400">
                        <span className="font-mono">ID:</span> {control.last_execution.job_id.substring(0, 8)}...
                      </p>
                      <p className="text-gray-600 dark:text-gray-400">
                        <span className="font-mono">Status:</span> {control.last_execution.status}
                      </p>
                      <p className="text-gray-600 dark:text-gray-400">
                        <span className="font-mono">Time:</span> {new Date(control.last_execution.timestamp).toLocaleTimeString()}
                      </p>
                    </>
                  ) : (
                    <p className="text-gray-500 dark:text-gray-400 italic">No jobs executed yet</p>
                  )}
                </div>
              )}
            </div>
          </div>
      </div>

      <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          <p className="flex items-center gap-1">
            <Zap className="w-3 h-3" />
            Control-based execution via API proxy
          </p>
      </div>

      {/* Custom QASM Modal */}
      <CustomQASMModal
          isOpen={customQasmModal.isOpen}
          initialContent={customQasmContent}
          onSubmit={handleCustomQasmSubmit}
          onCancel={handleCustomQasmCancel}
      />
    </div>
  )
}