import { useState, useRef, useEffect } from 'react'
import { LOCAL_AGENT_HTTP_URL, FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'
import { agentFetch } from '../../hooks/mcp/shared'
import { emitClusterCreated } from '../../lib/analytics'
import { useConnectTabState } from './add-cluster/useConnectTabState'
import type { TabId, ImportState, ConnectStep, ConnectState, PreviewContext, CloudProvider, CloudCLIInfo } from './add-cluster/types'

interface UseAddClusterFormOptions {
  open: boolean
  onClose: () => void
}

/**
 * Owns all form/step/validation state for AddClusterDialog: the command-line
 * tab's cloud CLI status, the import tab's kubeconfig preview/import flow,
 * and the connect tab's cluster registration flow (via useConnectTabState).
 */
export function useAddClusterForm({ open, onClose }: UseAddClusterFormOptions) {
  const [activeTab, setActiveTab] = useState<TabId>('command-line')
  const [kubeconfigYaml, setKubeconfigYaml] = useState('')
  const [importState, setImportState] = useState<ImportState>('idle')
  const [previewContexts, setPreviewContexts] = useState<PreviewContext[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const [importedCount, setImportedCount] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Connect tab state
  const [connectStep, setConnectStep] = useState<ConnectStep>(1)
  const [connectState, setConnectState] = useState<ConnectState>('idle')
  const [serverUrl, setServerUrl] = useState('')
  const [authType, setAuthType] = useState<'token' | 'certificate' | 'cloud-iam'>('token')
  const [token, setToken] = useState('')
  const [certData, setCertData] = useState('')
  const [keyData, setKeyData] = useState('')
  const [caData, setCaData] = useState('')
  const [skipTls, setSkipTls] = useState(false)
  const [contextName, setContextName] = useState('')
  const [clusterName, setClusterName] = useState('')
  const [namespace, setNamespace] = useState('')
  const [testResult, setTestResult] = useState<{ reachable: boolean; serverVersion?: string; error?: string } | null>(null)
  const [connectError, setConnectError] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [selectedCloudProvider, setSelectedCloudProvider] = useState<CloudProvider>('eks')
  const [cloudCLIs, setCloudCLIs] = useState<CloudCLIInfo[]>([])
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== undefined) clearTimeout(closeTimerRef.current)
    }
  }, [])

  // Fetch cloud CLI status from the agent
  useEffect(() => {
    if (!open) return
    agentFetch(`${LOCAL_AGENT_HTTP_URL}/cloud-cli-status`, { signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      .then(res => res.json())
      .then(data => setCloudCLIs(data.clis || []))
      .catch(() => { /* non-critical — just won't show cloud quick connect */ })
  }, [open])

  // Derived loading state — true while any async operation is in progress
  const isLoading = importState === 'previewing' || importState === 'importing' ||
    connectState === 'testing' || connectState === 'adding'

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose()
      }
    }
    if (open) {
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, isLoading, onClose])

  const resetConnectState = () => {
    setConnectStep(1)
    setConnectState('idle')
    setServerUrl(''); setAuthType('token'); setToken(''); setCertData(''); setKeyData('')
    setCaData(''); setSkipTls(false); setContextName(''); setClusterName('')
    setNamespace(''); setTestResult(null); setConnectError(''); setShowAdvanced(false)
  }

  const resetImportState = (initialYaml = '') => {
    setKubeconfigYaml(initialYaml)
    setImportState('idle')
    setPreviewContexts([])
    setErrorMessage('')
    setImportedCount(0)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      resetImportState(ev.target?.result as string)
    }
    reader.readAsText(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handlePreview = async () => {
    setImportState('previewing')
    setErrorMessage('')
    try {
      const res = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/kubeconfig/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ kubeconfig: kubeconfigYaml }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(body.error || res.statusText)
      }
      const data = await res.json()
      setPreviewContexts(data.contexts || [])
      setImportState('previewed')
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
      setImportState('error')
    }
  }

  const handleImport = async () => {
    setImportState('importing')
    setErrorMessage('')
    try {
      const res = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/kubeconfig/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ kubeconfig: kubeconfigYaml }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(body.error || res.statusText)
      }
      const data = await res.json()
      const count = data.importedCount ?? previewContexts.filter((c) => c.isNew).length
      setImportedCount(count)
      setImportState('done')
      if (closeTimerRef.current !== undefined) clearTimeout(closeTimerRef.current)
      closeTimerRef.current = setTimeout(() => {
        resetImportState()
        onClose()
      }, 1500)
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
      setImportState('error')
    }
  }

  const handleTestConnection = async () => {
    setConnectState('testing')
    setTestResult(null)
    setConnectError('')
    try {
      const res = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/kubeconfig/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          serverUrl,
          authType,
          token: authType === 'token' ? token : undefined,
          certData: authType === 'certificate' ? btoa(certData) : undefined,
          keyData: authType === 'certificate' ? btoa(keyData) : undefined,
          caData: caData ? btoa(caData) : undefined,
          skipTlsVerify: skipTls }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      const data = await res.json()
      setTestResult(data)
      setConnectState('tested')
    } catch (err: unknown) {
      setConnectError(err instanceof Error ? err.message : String(err))
      setConnectState('error')
    }
  }

  const handleAddCluster = async () => {
    setConnectState('adding')
    setConnectError('')
    try {
      const res = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/kubeconfig/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          contextName,
          clusterName,
          serverUrl,
          authType,
          token: authType === 'token' ? token : undefined,
          certData: authType === 'certificate' ? btoa(certData) : undefined,
          keyData: authType === 'certificate' ? btoa(keyData) : undefined,
          caData: caData ? btoa(caData) : undefined,
          skipTlsVerify: skipTls,
          namespace: namespace || undefined }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(body.error || res.statusText)
      }
      setConnectState('done')
      emitClusterCreated(clusterName, authType)
      if (closeTimerRef.current !== undefined) clearTimeout(closeTimerRef.current)
      closeTimerRef.current = setTimeout(() => {
        resetConnectState()
        onClose()
      }, 1500)
    } catch (err: unknown) {
      setConnectError(err instanceof Error ? err.message : String(err))
      setConnectState('error')
    }
  }

  // Validate server URL has a valid scheme and host
  const isValidServerUrl = (urlStr: string): boolean => {
    try {
      const parsed = new URL(urlStr)
      return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.hostname !== ''
    } catch {
      return false
    }
  }

  const goToConnectStep = (step: ConnectStep) => {
    // Validate URL before advancing past step 1
    if (step >= 2 && !isValidServerUrl(serverUrl)) {
      setConnectError('Server URL must be a valid URL with scheme (e.g. https://api.example.com:6443)')
      return
    }
    setConnectError('')
    if (step === 3) {
      try {
        const url = new URL(serverUrl)
        const host = url.hostname.replace(/\./g, '-')
        if (!contextName) setContextName(host)
        if (!clusterName) setClusterName(host)
      } catch { /* fallback: auto-name won't be set, user can type manually */ }
    }
    setConnectStep(step)
  }

  const connectTabState = useConnectTabState({
    connectStep,
    setConnectStep,
    connectState,
    serverUrl,
    setServerUrl,
    authType,
    setAuthType,
    token,
    setToken,
    certData,
    setCertData,
    keyData,
    setKeyData,
    caData,
    setCaData,
    skipTls,
    setSkipTls,
    contextName,
    setContextName,
    clusterName,
    setClusterName,
    namespace,
    setNamespace,
    testResult,
    resetTestResult: () => setTestResult(null),
    connectError,
    showAdvanced,
    setShowAdvanced,
    selectedCloudProvider,
    setSelectedCloudProvider,
    goToConnectStep,
    handleTestConnection,
    handleAddCluster,
  })

  // Clear stale close timers when the dialog is closed (#7593)
  // Also reset per-tab form state on close so the next open starts fresh.
  // (During a single open session, state is preserved across tab switches — see #8913.)
  useEffect(() => {
    if (!open) {
      if (closeTimerRef.current !== undefined) clearTimeout(closeTimerRef.current)
      resetConnectState()
      resetImportState()
    }
  }, [open])

  return {
    activeTab,
    setActiveTab,
    kubeconfigYaml,
    setKubeconfigYaml,
    importState,
    setImportState,
    previewContexts,
    setPreviewContexts,
    errorMessage,
    setErrorMessage,
    importedCount,
    fileInputRef,
    handleFileUpload,
    handlePreview,
    handleImport,
    cloudCLIs,
    isLoading,
    connectTabState,
  }
}
