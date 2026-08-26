import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../../../../lib/auth'
import { useToast } from '../../../ui/Toast'
import { useTranslation } from 'react-i18next'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../../lib/constants/network'

const LOOP_MODE_STATUS_SYNC_DELAY_MS = 100
const EXECUTION_STATUS_POLL_DELAY_MS = 500

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

const DEMO_DATA: ControlState = {
  backend: 'aer',
  shots: 1024,
  qasm_file: 'bell.qasm',
  executing: false,
  loop_mode: false,
}

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

interface UseQuantumControlsProps {
  status: unknown
  isAuthenticated: boolean
  refetchStatus: () => Promise<void>
  isDemoFallback: boolean
}

export function useQuantumControls({ status, isAuthenticated, refetchStatus, isDemoFallback }: UseQuantumControlsProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { showToast } = useToast()
  const { token } = useAuth()

  const [control, setControl] = useState<ControlState>(DEMO_DATA)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)
  const [customQasmContent, setCustomQasmContent] = useState<string>('')
  const [previousQasmFile, setPreviousQasmFile] = useState<string>(DEMO_DATA.qasm_file)

  const hasInitializedControlRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated || !status) {
      hasInitializedControlRef.current = false
      return
    }

    if (!hasInitializedControlRef.current) {
      setControl(prev => {
        const statusObj = status as { backend_info?: { name: string; shots: number }; loop_mode?: boolean }
        const backendInfo = statusObj.backend_info || { name: prev.backend, shots: prev.shots }
        return {
          ...prev,
          backend: backendInfo?.name || prev.backend,
          shots: backendInfo?.shots || prev.shots,
          loop_mode: statusObj.loop_mode !== undefined ? statusObj.loop_mode : prev.loop_mode,
        }
      })
      hasInitializedControlRef.current = true
      return
    }

    setControl(prev => {
      const statusObj = status as { loop_mode?: boolean }
      const newLoopMode = statusObj.loop_mode !== undefined ? statusObj.loop_mode : prev.loop_mode
      if (prev.loop_mode === newLoopMode) return prev
      return { ...prev, loop_mode: newLoopMode }
    })
  }, [isAuthenticated, status])

  const handleExecute = useCallback(async () => {
    if (isDemoFallback) return

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
  }, [control.qasm_file, control.backend, control.shots, customQasmContent, token, refetchStatus, t, isDemoFallback])

  const handleLoopModeToggle = useCallback(async () => {
    if (isDemoFallback) return

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
  }, [control.loop_mode, token, refetchStatus, t, isDemoFallback])

  const handleCustomQasmSubmit = useCallback((content: string) => {
    setCustomQasmContent(content)
    setControl(prev => ({ ...prev, qasm_file: 'custom' }))
    showToast(t('quantumControlPanel.customQasmSaved'), 'success')
  }, [showToast, t])

  const handleCustomQasmCancel = useCallback(() => {
    setControl(prev => ({ ...prev, qasm_file: previousQasmFile }))
  }, [previousQasmFile])

  return {
    control,
    setControl,
    mutationError,
    setMutationError,
    isExecuting,
    customQasmContent,
    setCustomQasmContent,
    previousQasmFile,
    setPreviousQasmFile,
    handleExecute,
    handleLoopModeToggle,
    handleCustomQasmSubmit,
    handleCustomQasmCancel,
  }
}
