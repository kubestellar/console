import { useState, useRef, useEffect } from 'react'
import { X, Terminal, Upload, FormInput } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LOCAL_AGENT_HTTP_URL, FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'
import { emitClusterCreated } from '../../lib/analytics'
import { CommandLineTab } from './add-cluster/CommandLineTab'
import { ImportTab } from './add-cluster/ImportTab'
import { ConnectTab } from './add-cluster/ConnectTab'
import type { TabId, ImportState, ConnectStep, ConnectState, PreviewContext, CloudProvider, CloudCLIInfo } from './add-cluster/types'

interface AddClusterDialogProps {
  open: boolean
  onClose: () => void
}

export function AddClusterDialog({ open, onClose }: AddClusterDialogProps) {
  const { t } = useTranslation()
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
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => clearTimeout(closeTimerRef.current)
  }, [])

  // Fetch cloud CLI status from the agent
  useEffect(() => {
    if (!open) return
    fetch(`${LOCAL_AGENT_HTTP_URL}/cloud-cli-status`, { signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      .then(res => res.json())
      .then(data => setCloudCLIs(data.clis || []))
      .catch(() => { /* non-critical — just won't show cloud quick connect */ })
  }, [open])

  // Derived loading state — true while any async operation is in progress
  const isLoading = importState === 'previewing' || importState === 'importing' ||
    connectState === 'testing' || connectState === 'adding'

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
      const res = await fetch(`${LOCAL_AGENT_HTTP_URL}/kubeconfig/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kubeconfig: kubeconfigYaml }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(body.error || res.statusText)
      }
      const data = await res.json()
      setPreviewContexts(data.contexts || [])
      setImportState('previewed')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
      setImportState('error')
    }
  }

  const handleImport = async () => {
    setImportState('importing')
    setErrorMessage('')
    try {
      const res = await fetch(`${LOCAL_AGENT_HTTP_URL}/kubeconfig/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = setTimeout(() => {
        resetImportState()
        onClose()
      }, 1500)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
      setImportState('error')
    }
  }

  const handleTestConnection = async () => {
    setConnectState('testing')
    setTestResult(null)
    setConnectError('')
    try {
      const res = await fetch(`${LOCAL_AGENT_HTTP_URL}/kubeconfig/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : String(err))
      setConnectState('error')
    }
  }

  const handleAddCluster = async () => {
    setConnectState('adding')
    setConnectError('')
    try {
      const res = await fetch(`${LOCAL_AGENT_HTTP_URL}/kubeconfig/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = setTimeout(() => {
        resetConnectState()
        onClose()
      }, 1500)
    } catch (err) {
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

  // Clear stale close timers when the dialog is closed (#7593)
  useEffect(() => {
    if (!open) {
      clearTimeout(closeTimerRef.current)
    }
  }, [open])

  if (!open) return null

  const tabs: { id: TabId; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
    { id: 'command-line', label: t('cluster.addClusterCommandLine'), icon: <Terminal className="w-4 h-4" /> },
    { id: 'import', label: t('cluster.addClusterImport'), icon: <Upload className="w-4 h-4" /> },
    { id: 'connect', label: t('cluster.addClusterConnect'), icon: <FormInput className="w-4 h-4" /> },
  ]

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-cluster-dialog-title"
        className="relative w-full max-w-2xl mx-4 bg-card border border-border dark:border-white/10 rounded-xl shadow-2xl"
        aria-busy={isLoading}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border dark:border-white/10">
          <h2 id="add-cluster-dialog-title" className="text-lg font-semibold text-foreground">{t('cluster.addClusterTitle')}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border dark:border-white/10 px-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                if (!tab.disabled) {
                  setActiveTab(tab.id)
                  if (tab.id !== 'connect') resetConnectState()
                  if (tab.id !== 'import') resetImportState()
                }
              }}
              disabled={tab.disabled}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-purple-500 text-foreground'
                  : tab.disabled
                    ? 'border-transparent opacity-50 cursor-not-allowed text-muted-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
          {activeTab === 'command-line' && (
            <CommandLineTab cloudCLIs={cloudCLIs} />
          )}

          {activeTab === 'import' && (
            <ImportTab
              kubeconfigYaml={kubeconfigYaml}
              setKubeconfigYaml={setKubeconfigYaml}
              importState={importState}
              setImportState={setImportState}
              previewContexts={previewContexts}
              setPreviewContexts={setPreviewContexts}
              errorMessage={errorMessage}
              setErrorMessage={setErrorMessage}
              importedCount={importedCount}
              fileInputRef={fileInputRef}
              handleFileUpload={handleFileUpload}
              handlePreview={handlePreview}
              handleImport={handleImport}
            />
          )}

          {activeTab === 'connect' && (
            <ConnectTab
              connectStep={connectStep}
              setConnectStep={setConnectStep}
              connectState={connectState}
              serverUrl={serverUrl}
              setServerUrl={setServerUrl}
              authType={authType}
              setAuthType={setAuthType}
              token={token}
              setToken={setToken}
              certData={certData}
              setCertData={setCertData}
              keyData={keyData}
              setKeyData={setKeyData}
              caData={caData}
              setCaData={setCaData}
              skipTls={skipTls}
              setSkipTls={setSkipTls}
              contextName={contextName}
              setContextName={setContextName}
              clusterName={clusterName}
              setClusterName={setClusterName}
              namespace={namespace}
              setNamespace={setNamespace}
              testResult={testResult}
              connectError={connectError}
              showAdvanced={showAdvanced}
              setShowAdvanced={setShowAdvanced}
              selectedCloudProvider={selectedCloudProvider}
              setSelectedCloudProvider={setSelectedCloudProvider}
              goToConnectStep={goToConnectStep}
              handleTestConnection={handleTestConnection}
              handleAddCluster={handleAddCluster}
            />
          )}
        </div>
      </div>
    </div>
  )
}
