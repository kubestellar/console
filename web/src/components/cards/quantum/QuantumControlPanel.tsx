import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReportCardDataState } from '../CardDataContext'
import { isQuantumForcedToDemo } from '../../../lib/demoMode'
import { useQASMFiles } from '../../../hooks/useQASMFiles'
import { useAuth } from '../../../lib/auth'
import { useDrillDown } from '../../../hooks/useDrillDown'
import { useModal } from '../../../hooks/useModal'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import { classifyApiError } from '../../../lib/errorHandling'
import { useQuantumAuthStatus, useQuantumSystemStatus, DEMO_QUANTUM_STATUS, QUANTUM_STATUS_DEFAULT_POLL_MS } from '../../../hooks/useCachedQuantum'
import { useToast } from '../../ui/Toast'
import { QuantumControlPanelView } from './QuantumControlPanelView'
import { BACKENDS_REQUIRING_IBM, DEMO_DATA, EXECUTION_STATUS_POLL_DELAY_MS, LOOP_MODE_STATUS_SYNC_DELAY_MS } from './quantumControlPanelTypes'
import { buildQuantumMutationHeaders } from './quantumControlPanelUtils'


export const QuantumControlPanel: React.FC = () => {
  const { t } = useTranslation(['cards', 'common'])
  const { showToast } = useToast()
  const { isAuthenticated, login, isLoading: authIsLoading, token } = useAuth()
  const { open: openDrillDown, close: closeDrillDown } = useDrillDown()
  const [control, setControl] = useState(DEMO_DATA)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [showClearCredentialsDialog, setShowClearCredentialsDialog] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [statusTab, setStatusTab] = useState<'system' | 'job'>('system')
  const [sessionValidatedAt, setSessionValidatedAt] = useState<number | null>(null)
  const customQasmModal = useModal()
  const [customQasmContent, setCustomQasmContent] = useState('')
  const [previousQasmFile, setPreviousQasmFile] = useState(DEMO_DATA.qasm_file)

  const forceDemo = isQuantumForcedToDemo()
  const hasInitializedControlRef = useRef(false)
  const requiresIBM = BACKENDS_REQUIRING_IBM.has(control.backend)
  const { files: qasmFiles, isLoading: qasmFilesLoading } = useQASMFiles(undefined, forceDemo)
  const { data: status, isLoading, isRefreshing, isDemoData: isDemoFallback, error: statusError, isFailed: isStatusFailed, consecutiveFailures, refetch: refetchStatus } = useQuantumSystemStatus({ isAuthenticated, forceDemo, pollInterval: QUANTUM_STATUS_DEFAULT_POLL_MS })
  const { data: authStatus, isRefreshing: isAuthRefreshing, error: authStatusError, refetch: refetchAuthStatus } = useQuantumAuthStatus({ isAuthenticated, forceDemo, pollInterval: QUANTUM_STATUS_DEFAULT_POLL_MS, autoRefresh: requiresIBM })

  const ibmAuthenticated = authStatus.authenticated
  const ibmTokenStored = authStatus.tokenStored
  const lastIbmError = authStatus.lastIbmError

  useEffect(() => {
    if (ibmAuthenticated && !isAuthRefreshing) setSessionValidatedAt(Date.now())
  }, [ibmAuthenticated, isAuthRefreshing])

  const fatalError = mutationError ?? statusError
  const classifiedFromMessage = authStatusError ? classifyApiError(authStatusError) : null
  const isAuthErrorTransient = lastIbmError != null ? lastIbmError.retryable === true : classifiedFromMessage?.retryable === true
  const hasAuthError = lastIbmError != null || classifiedFromMessage !== null
  const authErrorForBanner = hasAuthError && !isAuthErrorTransient && requiresIBM ? (lastIbmError?.message ?? authStatusError) : null
  const error = fatalError || authErrorForBanner
  const ibmCredentialState: 'configured' | 'stored' | 'none' = sessionValidatedAt !== null ? 'configured' : ibmTokenStored ? 'stored' : 'none'

  useReportCardDataState({ isLoading: isAuthenticated ? isLoading && status === null : false, isRefreshing: isRefreshing || isAuthRefreshing, isDemoData: isAuthenticated ? isDemoFallback : false, hasData: isAuthenticated ? status !== null : false, isFailed: isStatusFailed || fatalError !== null, consecutiveFailures })

  useEffect(() => {
    if (!isAuthenticated || !status) {
      hasInitializedControlRef.current = false
      return
    }
    if (!hasInitializedControlRef.current) {
      setControl(prev => {
        const backendInfo = status.backend_info || { name: prev.backend, shots: prev.shots }
        return { ...prev, backend: backendInfo?.name || prev.backend, shots: backendInfo?.shots || prev.shots, loop_mode: status.loop_mode !== undefined ? status.loop_mode : prev.loop_mode }
      })
      hasInitializedControlRef.current = true
      return
    }
    setControl(prev => {
      const newLoopMode = status.loop_mode !== undefined ? status.loop_mode : prev.loop_mode
      return prev.loop_mode === newLoopMode ? prev : { ...prev, loop_mode: newLoopMode }
    })
  }, [isAuthenticated, status])

  const handleOpenCredentialsDialog = useCallback(() => {
    const handleSaveCredentials = async (form: { apiKey: string; crn: string }) => {
      if (!form.apiKey.trim() || !form.crn.trim()) throw new Error(t('quantumControlPanel.credentialFieldsRequired'))
      const res = await fetch('/api/quantum/auth/save', { method: 'POST', headers: buildQuantumMutationHeaders(token), credentials: 'include', signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS), body: JSON.stringify({ api_key: form.apiKey, crn: form.crn }) })
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || t('quantumControlPanel.saveCredentialsFailed'))
      }
      setMutationError(null)
      await refetchAuthStatus()
      showToast(t('quantumControlPanel.ibmCredentialsSaved'), 'success')
    }
    openDrillDown({ type: 'quantum-credentials', title: t('quantumControlPanel.ibmCredentialsTitle'), data: { ibmAuthenticated, onSave: handleSaveCredentials, onClose: closeDrillDown } })
  }, [closeDrillDown, ibmAuthenticated, openDrillDown, refetchAuthStatus, showToast, t, token])

  const handleClearCredentials = useCallback(async () => {
    setIsClearing(true)
    try {
      const res = await fetch('/api/quantum/auth/clear', { method: 'DELETE', headers: buildQuantumMutationHeaders(token), credentials: 'include', signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
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
  }, [isClearing, showClearCredentialsDialog])

  const handleExecute = useCallback(async () => {
    setIsExecuting(true)
    setMutationError(null)
    setControl(prev => ({ ...prev, executing: true }))
    try {
      let qasmFilename = control.qasm_file
      if (control.qasm_file === 'custom') {
        const timestamp = Date.now()
        qasmFilename = `custom_${timestamp}.qasm`
        const uploadRes = await fetch('/api/quantum/qasm/file', { method: 'POST', headers: buildQuantumMutationHeaders(token), credentials: 'include', signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS), body: JSON.stringify({ name: qasmFilename, content: customQasmContent }) })
        if (!uploadRes.ok) throw new Error('Failed to save custom QASM')
      }
      const response = await fetch('/api/quantum/execute', { method: 'POST', headers: buildQuantumMutationHeaders(token), credentials: 'include', signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS), body: JSON.stringify({ backend: control.backend, shots: control.shots, qasm_file: qasmFilename }) })
      if (!response.ok) {
        const errBody = await response.text().catch(() => '')
        if (errBody) console.error('[QuantumControlPanel] execute failed', { status: response.status, body: errBody })
        throw new Error(`Execution failed (HTTP ${response.status})`)
      }
      const result = await response.json()
      setControl(prev => ({ ...prev, last_execution: { job_id: result.job_id, status: result.status, timestamp: new Date().toISOString() } }))
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
  }, [control, customQasmContent, refetchStatus, t, token])

  const handleLoopModeToggle = useCallback(async () => {
    setMutationError(null)
    try {
      const endpoint = control.loop_mode ? '/api/quantum/loop/stop' : '/api/quantum/loop/start'
      const response = await fetch(endpoint, { method: 'POST', headers: buildQuantumMutationHeaders(token), credentials: 'include', signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      if (!response.ok) throw new Error(t('quantumControlPanel.loopModeToggleFailed'))
      await new Promise(resolve => setTimeout(resolve, LOOP_MODE_STATUS_SYNC_DELAY_MS))
      await refetchStatus()
      setMutationError(null)
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : t('quantumControlPanel.loopModeToggleFailed'))
    }
  }, [control.loop_mode, refetchStatus, t, token])

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

  const displayStatus = status || DEMO_QUANTUM_STATUS
  const isHealthy = displayStatus.status === 'ready' || displayStatus.loop_running === true

  return <QuantumControlPanelView t={t} authIsLoading={authIsLoading} isAuthenticated={isAuthenticated} login={login} error={error} isDemoFallback={isDemoFallback} isAuthErrorTransient={isAuthErrorTransient} requiresIBM={requiresIBM} handleOpenCredentialsDialog={handleOpenCredentialsDialog} ibmCredentialState={ibmCredentialState} refetchAuthStatus={refetchAuthStatus} isAuthRefreshing={isAuthRefreshing} setShowClearCredentialsDialog={setShowClearCredentialsDialog} isClearing={isClearing} showClearCredentialsDialog={showClearCredentialsDialog} handleClearCredentials={handleClearCredentials} control={control} setControl={setControl} qasmFilesLoading={qasmFilesLoading} qasmFiles={qasmFiles} customQasmModal={customQasmModal} customQasmContent={customQasmContent} setPreviousQasmFile={setPreviousQasmFile} handleExecute={handleExecute} isExecuting={isExecuting} handleLoopModeToggle={handleLoopModeToggle} statusTab={statusTab} setStatusTab={setStatusTab} displayStatus={displayStatus} isHealthy={isHealthy} handleCustomQasmSubmit={handleCustomQasmSubmit} handleCustomQasmCancel={handleCustomQasmCancel} />
}
