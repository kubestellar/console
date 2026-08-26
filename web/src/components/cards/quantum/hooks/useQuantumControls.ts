import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../../lib/auth'
import { useDrillDown } from '../../../../hooks/useDrillDown'
import { useModal } from '../../../../hooks/useModal'
import { useQASMFiles } from '../../../../hooks/useQASMFiles'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../../lib/constants/network'
import { classifyApiError } from '../../../../lib/errorHandling'
import {
  useQuantumSystemStatus,
  useQuantumAuthStatus,
  DEMO_QUANTUM_STATUS,
  QUANTUM_STATUS_DEFAULT_POLL_MS,
  type QuantumSystemStatus,
} from '../../../../hooks/useCachedQuantum'
import { useToast } from '../../../ui/Toast'
import { isQuantumForcedToDemo } from '../../../../lib/demoMode'

export interface ControlState {
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

const LARGE_CIRCUIT_QASM = 'expt32.qasm'
const LOOP_MODE_STATUS_SYNC_DELAY_MS = 100
const EXECUTION_STATUS_POLL_DELAY_MS = 500
const CONTROL_PANEL_POLL_MS = QUANTUM_STATUS_DEFAULT_POLL_MS

export const BACKENDS_REQUIRING_IBM: ReadonlySet<string> = new Set(['qx5', 'least', 'aer_noise'])

export const DEMO_CONTROL_STATE: ControlState = {
  backend: 'aer',
  shots: 1024,
  qasm_file: 'bell.qasm',
  executing: false,
  loop_mode: false,
}

export const DEMO_STATUS: QuantumSystemStatus = DEMO_QUANTUM_STATUS

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

export function useQuantumControls() {
  const { t } = useTranslation(['cards', 'common'])
  const { showToast } = useToast()
  const { isAuthenticated, login, isLoading: authIsLoading, token } = useAuth()
  const { open: openDrillDown, close: closeDrillDown } = useDrillDown()
  const [control, setControl] = useState<ControlState>(DEMO_CONTROL_STATE)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [showClearCredentialsDialog, setShowClearCredentialsDialog] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [statusTab, setStatusTab] = useState<'system' | 'job'>('system')
  const [sessionValidatedAt, setSessionValidatedAt] = useState<number | null>(null)

  const customQasmModal = useModal()
  const [customQasmContent, setCustomQasmContent] = useState<string>('')
  const [previousQasmFile, setPreviousQasmFile] = useState<string>(DEMO_CONTROL_STATE.qasm_file)

  const forceDemo = isQuantumForcedToDemo()
  const hasInitializedControlRef = useRef(false)
  const requiresIBM = BACKENDS_REQUIRING_IBM.has(control.backend)

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

  useEffect(() => {
    if (ibmAuthenticated && !isAuthRefreshing) {
      setSessionValidatedAt(Date.now())
    }
  }, [ibmAuthenticated, isAuthRefreshing])

  const fatalError = mutationError ?? statusError
  const classifiedFromMessage = authStatusError ? classifyApiError(authStatusError) : null
  const isAuthErrorTransient =
    lastIbmError != null
      ? lastIbmError.retryable === true
      : classifiedFromMessage?.retryable === true
  const hasAuthError = lastIbmError != null || classifiedFromMessage !== null
  const authErrorForBanner =
    hasAuthError && !isAuthErrorTransient && requiresIBM
      ? (lastIbmError?.message ?? authStatusError)
      : null
  const error = fatalError || authErrorForBanner

  const ibmCredentialState: 'configured' | 'stored' | 'none' =
    sessionValidatedAt !== null
      ? 'configured'
      : ibmTokenStored
        ? 'stored'
        : 'none'

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

      await new Promise(resolve => setTimeout(resolve, LOOP_MODE_STATUS_SYNC_DELAY_MS))
      await refetchStatus()
      setMutationError(null)
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : t('quantumControlPanel.loopModeToggleFailed'))
    }
  }

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

  const handleQasmFileChange = useCallback((val: string) => {
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
  }, [control.qasm_file, control.backend, customQasmModal])

  return {
    // Auth
    isAuthenticated,
    authIsLoading,
    login,
    // Status data
    status,
    isLoading,
    isRefreshing,
    isDemoFallback,
    isStatusFailed,
    consecutiveFailures,
    refetchStatus,
    refetchAuthStatus,
    isAuthRefreshing,
    // Control state
    control,
    setControl,
    isExecuting,
    statusTab,
    setStatusTab,
    // IBM credentials
    ibmCredentialState,
    ibmAuthenticated,
    requiresIBM,
    isAuthErrorTransient,
    error,
    isDemoData: isDemoFallback,
    fatalError,
    // Dialogs
    showClearCredentialsDialog,
    setShowClearCredentialsDialog,
    isClearing,
    // QASM
    qasmFiles,
    qasmFilesLoading,
    customQasmModal,
    customQasmContent,
    // Handlers
    handleOpenCredentialsDialog,
    handleClearCredentials,
    handleExecute,
    handleLoopModeToggle,
    handleCustomQasmSubmit,
    handleCustomQasmCancel,
    handleQasmFileChange,
    // Computed
    displayStatus: status || DEMO_STATUS,
    isHealthy: (status || DEMO_STATUS).status === 'ready' || (status || DEMO_STATUS).loop_running === true,
    LARGE_CIRCUIT_QASM,
  }
}
