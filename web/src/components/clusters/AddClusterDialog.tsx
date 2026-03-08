import { useState, useCallback, useRef, useEffect } from 'react'
import { X, Terminal, Upload, FormInput, Copy, Check, Loader2, ChevronDown, ChevronUp, Shield, KeyRound, Cloud } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LOCAL_AGENT_HTTP_URL, FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../lib/constants/network'
import { CloudProviderIcon } from '../ui/CloudProviderIcon'
import { StatusBadge } from '../ui/StatusBadge'

interface AddClusterDialogProps {
  open: boolean
  onClose: () => void
}

type TabId = 'command-line' | 'import' | 'connect'

type ImportState = 'idle' | 'previewing' | 'previewed' | 'importing' | 'done' | 'error'
type ConnectStep = 1 | 2 | 3
type ConnectState = 'idle' | 'testing' | 'tested' | 'adding' | 'done' | 'error'

interface PreviewContext {
  context: string
  cluster: string
  server: string
  authMethod?: string
  isNew: boolean
}

const EXAMPLE_SERVER_URL = 'https://<api-server>:6443' // SECURITY: Safe — template placeholder, not a real endpoint

const COMMANDS = [
  {
    comment: '# 1. Add cluster credentials',
    command: `kubectl config set-cluster <cluster-name> --server=${EXAMPLE_SERVER_URL}`,
  },
  {
    comment: '# 2. Add authentication',
    command: 'kubectl config set-credentials <user-name> --token=<your-token>',
  },
  {
    comment: '# 3. Create a context',
    command: 'kubectl config set-context <context-name> --cluster=<cluster-name> --user=<user-name>',
  },
  {
    comment: '# 4. Switch to the new context (optional)',
    command: 'kubectl config use-context <context-name>',
  },
]

type CloudProvider = 'eks' | 'gke' | 'aks' | 'openshift'

// Cloud provider IAM auth commands — two steps: authenticate, then register cluster
const CLOUD_IAM_COMMANDS: Record<CloudProvider, { auth: string; register: string; cliName: string }> = {
  eks: {
    cliName: 'aws',
    auth: 'aws sso login',
    register: 'aws eks update-kubeconfig --name <CLUSTER> --region <REGION>',
  },
  gke: {
    cliName: 'gcloud',
    auth: 'gcloud auth login',
    register: 'gcloud container clusters get-credentials <CLUSTER> --zone <ZONE> --project <PROJECT>',
  },
  aks: {
    cliName: 'az',
    auth: 'az login',
    register: 'az aks get-credentials --resource-group <RG> --name <CLUSTER>',
  },
  openshift: {
    cliName: 'oc',
    auth: 'oc login <API_SERVER_URL>',
    register: '', // oc login already sets up kubeconfig
  },
}

interface CloudCLIInfo {
  name: string
  provider: string
  found: boolean
  path?: string
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    return () => clearTimeout(copiedTimerRef.current)
  }, [])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopied(false), UI_FEEDBACK_TIMEOUT_MS)
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
    </button>
  )
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
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>()

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

  const resetConnectState = useCallback(() => {
    setConnectStep(1)
    setConnectState('idle')
    setServerUrl(''); setAuthType('token'); setToken(''); setCertData(''); setKeyData('')
    setCaData(''); setSkipTls(false); setContextName(''); setClusterName('')
    setNamespace(''); setTestResult(null); setConnectError(''); setShowAdvanced(false)
  }, [])

  const resetImportState = useCallback(() => {
    setKubeconfigYaml('')
    setImportState('idle')
    setPreviewContexts([])
    setErrorMessage('')
    setImportedCount(0)
  }, [])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setKubeconfigYaml(ev.target?.result as string)
      setImportState('idle')
      setPreviewContexts([])
      setErrorMessage('')
    }
    reader.readAsText(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handlePreview = useCallback(async () => {
    setImportState('previewing')
    setErrorMessage('')
    try {
      const res = await fetch(`${LOCAL_AGENT_HTTP_URL}/kubeconfig/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kubeconfig: kubeconfigYaml }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
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
  }, [kubeconfigYaml])

  const handleImport = useCallback(async () => {
    setImportState('importing')
    setErrorMessage('')
    try {
      const res = await fetch(`${LOCAL_AGENT_HTTP_URL}/kubeconfig/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kubeconfig: kubeconfigYaml }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
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
  }, [kubeconfigYaml, previewContexts, resetImportState, onClose])

  const handleTestConnection = useCallback(async () => {
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
          skipTlsVerify: skipTls,
        }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      const data = await res.json()
      setTestResult(data)
      setConnectState('tested')
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : String(err))
      setConnectState('error')
    }
  }, [serverUrl, authType, token, certData, keyData, caData, skipTls])

  const handleAddCluster = useCallback(async () => {
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
          namespace: namespace || undefined,
        }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(body.error || res.statusText)
      }
      setConnectState('done')
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = setTimeout(() => {
        resetConnectState()
        onClose()
      }, 1500)
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : String(err))
      setConnectState('error')
    }
  }, [contextName, clusterName, serverUrl, authType, token, certData, keyData, caData, skipTls, namespace, resetConnectState, onClose])

  const goToConnectStep = useCallback((step: ConnectStep) => {
    if (step === 3) {
      try {
        const url = new URL(serverUrl)
        const host = url.hostname.replace(/\./g, '-')
        if (!contextName) setContextName(host)
        if (!clusterName) setClusterName(host)
      } catch { /* ignore parse errors */ }
    }
    setConnectStep(step)
  }, [serverUrl, contextName, clusterName])

  if (!open) return null

  const newCount = previewContexts.filter((c) => c.isNew).length

  const tabs: { id: TabId; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
    { id: 'command-line', label: t('cluster.addClusterCommandLine'), icon: <Terminal className="w-4 h-4" /> },
    { id: 'import', label: t('cluster.addClusterImport'), icon: <Upload className="w-4 h-4" /> },
    { id: 'connect', label: t('cluster.addClusterConnect'), icon: <FormInput className="w-4 h-4" /> },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-cluster-dialog-title"
        className="relative w-full max-w-2xl mx-4 bg-card border border-white/10 rounded-xl shadow-2xl"
        aria-busy={isLoading}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 id="add-cluster-dialog-title" className="text-lg font-semibold text-foreground">{t('cluster.addClusterTitle')}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 px-6">
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
            <div className="space-y-4">
              {/* Cloud Quick Connect — shows detected cloud CLIs */}
              {cloudCLIs.some(c => c.found) && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-foreground">{t('cluster.cloudQuickConnect')}</h3>
                  <p className="text-xs text-muted-foreground">{t('cluster.cloudQuickConnectDesc')}</p>
                  <div className="grid grid-cols-1 gap-2">
                    {cloudCLIs.filter(c => c.found).map(cli => {
                      const providerKey = cli.name === 'aws' ? 'eks' : cli.name === 'gcloud' ? 'gke' : cli.name === 'az' ? 'aks' : 'openshift'
                      const cmds = CLOUD_IAM_COMMANDS[providerKey as CloudProvider]
                      return (
                        <div key={cli.name} className="bg-secondary rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <CloudProviderIcon provider={providerKey} size={16} />
                            <span className="text-sm font-medium text-foreground">{cli.provider}</span>
                            <StatusBadge color="green" size="xs">detected</StatusBadge>
                          </div>
                          <div className="flex items-start justify-between gap-2">
                            <code className="text-xs text-muted-foreground font-mono break-all">{cmds.register || cmds.auth}</code>
                            <CopyButton text={cmds.register || cmds.auth} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="border-t border-white/10" />
                </div>
              )}

              <p className="text-sm text-muted-foreground">
                {t('cluster.addClusterCommandLineDesc')}
              </p>

              {COMMANDS.map((cmd, i) => (
                <div key={i} className="bg-secondary rounded-lg p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 font-mono text-sm overflow-x-auto">
                      <div className="text-muted-foreground">{cmd.comment}</div>
                      <div className="text-foreground mt-1">{cmd.command}</div>
                    </div>
                    <CopyButton text={cmd.command} />
                  </div>
                </div>
              ))}

              <p className="text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3 border border-white/5">
                {t('cluster.addClusterAutoDetect')}
              </p>
            </div>
          )}

          {activeTab === 'import' && (
            <div className="space-y-4">
              {importState === 'done' ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Check className="w-10 h-10 text-green-400 mb-3" />
                  <p className="text-sm text-green-400">{t('cluster.importSuccess', { count: importedCount })}</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">{t('cluster.importPaste')}</p>

                  <div className="flex items-center gap-2">
                    <textarea
                      value={kubeconfigYaml}
                      onChange={(e) => {
                        setKubeconfigYaml(e.target.value)
                        if (importState !== 'idle') {
                          setImportState('idle')
                          setPreviewContexts([])
                          setErrorMessage('')
                        }
                      }}
                      rows={6}
                      placeholder="apiVersion: v1&#10;kind: Config&#10;..."
                      className="bg-secondary rounded-lg p-4 font-mono text-sm w-full resize-y border border-white/10 focus:border-purple-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".yaml,.yml,.conf,.config"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-secondary text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors border border-white/10"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {t('cluster.importUpload')}
                    </button>
                    <button
                      onClick={handlePreview}
                      disabled={!kubeconfigYaml.trim() || importState === 'previewing'}
                      className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-md bg-purple-600 text-white hover:bg-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {importState === 'previewing' ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          {t('cluster.importPreviewing')}
                        </>
                      ) : (
                        t('cluster.importPreview')
                      )}
                    </button>
                  </div>

                  {errorMessage && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
                      {t('cluster.importError')}: {errorMessage}
                    </div>
                  )}

                  {(importState === 'previewed' || importState === 'importing') && previewContexts.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">{t('cluster.importPreviewDesc')}</p>
                      <div className="space-y-1">
                        {previewContexts.map((ctx) => (
                          <div
                            key={ctx.context}
                            className="flex items-center justify-between bg-secondary/50 rounded-lg px-4 py-2.5"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-foreground truncate">{ctx.context}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {ctx.cluster} — {ctx.server}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-3 shrink-0">
                              {ctx.authMethod && ctx.authMethod !== 'unknown' && (
                                <span className={`text-2xs px-1.5 py-0.5 rounded ${
                                  ctx.authMethod === 'exec' ? 'bg-blue-500/20 text-blue-400' :
                                  ctx.authMethod === 'token' ? 'bg-yellow-500/20 text-yellow-400' :
                                  ctx.authMethod === 'certificate' ? 'bg-green-500/20 text-green-400' :
                                  'bg-blue-500/20 text-blue-400'
                                }`}>
                                  {ctx.authMethod === 'exec' || ctx.authMethod === 'auth-provider' ? 'IAM' :
                                   ctx.authMethod === 'token' ? 'token' : 'cert'}
                                </span>
                              )}
                              {ctx.isNew ? (
                                <StatusBadge color="green">
                                  {t('cluster.importNew')}
                                </StatusBadge>
                              ) : (
                                <span className="bg-white/10 text-muted-foreground text-xs px-2 py-0.5 rounded">
                                  {t('cluster.importExists')}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {newCount === 0 ? (
                        <p className="text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3 border border-white/5">
                          {t('cluster.importNoNew')}
                        </p>
                      ) : (
                        <button
                          onClick={handleImport}
                          disabled={importState === 'importing'}
                          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {importState === 'importing' ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              {t('cluster.importImporting')}
                            </>
                          ) : (
                            t('cluster.importButton', { count: newCount })
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'connect' && (
            <div className="space-y-4">
              {connectState === 'done' ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Check className="w-10 h-10 text-green-400 mb-3" />
                  <p className="text-sm text-green-400">{t('cluster.connectSuccess')}</p>
                </div>
              ) : (
                <>
                  {/* Step indicator */}
                  <div className="flex items-center justify-center gap-3">
                    {([1, 2, 3] as ConnectStep[]).map((step) => (
                      <div key={step} className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                          connectStep === step
                            ? 'bg-purple-600 text-white'
                            : connectStep > step
                              ? 'bg-green-600 text-white'
                              : 'bg-white/10 text-muted-foreground'
                        }`}>
                          {connectStep > step ? <Check className="w-3.5 h-3.5" /> : step}
                        </div>
                        <span className={`text-xs ${connectStep === step ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {t(`cluster.connectStep${step}`)}
                        </span>
                        {step < 3 && <div className={`w-8 h-px ${connectStep > step ? 'bg-green-600' : 'bg-white/10'}`} />}
                      </div>
                    ))}
                  </div>

                  {/* Step 1: Server URL */}
                  {connectStep === 1 && (
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-foreground">{t('cluster.connectServerUrl')}</label>
                      <input
                        type="text"
                        value={serverUrl}
                        onChange={(e) => setServerUrl(e.target.value)}
                        placeholder={t('cluster.connectServerPlaceholder')}
                        className="bg-secondary rounded-lg px-4 py-2.5 text-sm w-full border border-white/10 focus:border-purple-500 focus:outline-none"
                      />
                      <div className="flex justify-end">
                        <button
                          onClick={() => goToConnectStep(2)}
                          disabled={!serverUrl.trim()}
                          className="px-4 py-2 text-sm font-medium rounded-lg bg-secondary text-foreground hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-white/10"
                        >
                          {t('cluster.connectNext')}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Authentication */}
                  {connectStep === 2 && (
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-foreground">{t('cluster.connectAuthType')}</label>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => setAuthType('token')}
                          className={`flex items-center gap-2 p-3 rounded-lg border text-sm text-left transition-colors ${
                            authType === 'token'
                              ? 'border-purple-500 bg-purple-500/10 text-foreground'
                              : 'border-white/10 bg-secondary text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <KeyRound className="w-4 h-4 shrink-0" />
                          {t('cluster.connectAuthToken')}
                        </button>
                        <button
                          onClick={() => setAuthType('certificate')}
                          className={`flex items-center gap-2 p-3 rounded-lg border text-sm text-left transition-colors ${
                            authType === 'certificate'
                              ? 'border-purple-500 bg-purple-500/10 text-foreground'
                              : 'border-white/10 bg-secondary text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <Shield className="w-4 h-4 shrink-0" />
                          {t('cluster.connectAuthCert')}
                        </button>
                        <button
                          onClick={() => setAuthType('cloud-iam')}
                          className={`flex items-center gap-2 p-3 rounded-lg border text-sm text-left transition-colors ${
                            authType === 'cloud-iam'
                              ? 'border-purple-500 bg-purple-500/10 text-foreground'
                              : 'border-white/10 bg-secondary text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <Cloud className="w-4 h-4 shrink-0" />
                          {t('cluster.connectAuthIAM')}
                        </button>
                      </div>

                      {authType === 'token' && (
                        <div className="space-y-1.5">
                          <label className="text-xs text-muted-foreground">{t('cluster.connectTokenLabel')}</label>
                          <input
                            type="password"
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            placeholder={t('cluster.connectTokenPlaceholder')}
                            className="bg-secondary rounded-lg px-4 py-2.5 text-sm w-full border border-white/10 focus:border-purple-500 focus:outline-none font-mono"
                          />
                        </div>
                      )}

                      {authType === 'certificate' && (
                        <div className="space-y-2">
                          <div className="space-y-1.5">
                            <label className="text-xs text-muted-foreground">{t('cluster.connectCertLabel')}</label>
                            <textarea
                              value={certData}
                              onChange={(e) => setCertData(e.target.value)}
                              rows={3}
                              placeholder="-----BEGIN CERTIFICATE-----"
                              className="bg-secondary rounded-lg px-4 py-2 text-xs w-full border border-white/10 focus:border-purple-500 focus:outline-none font-mono resize-none"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs text-muted-foreground">{t('cluster.connectKeyLabel')}</label>
                            <textarea
                              value={keyData}
                              onChange={(e) => setKeyData(e.target.value)}
                              rows={3}
                              placeholder="-----BEGIN RSA PRIVATE KEY-----"
                              className="bg-secondary rounded-lg px-4 py-2 text-xs w-full border border-white/10 focus:border-purple-500 focus:outline-none font-mono resize-none"
                            />
                          </div>
                        </div>
                      )}

                      {authType === 'cloud-iam' && (
                        <div className="space-y-3">
                          <p className="text-xs text-muted-foreground">{t('cluster.cloudIAMDesc')}</p>

                          {/* Provider selector */}
                          <div className="grid grid-cols-4 gap-2">
                            {(['eks', 'gke', 'aks', 'openshift'] as CloudProvider[]).map((p) => (
                              <button
                                key={p}
                                onClick={() => setSelectedCloudProvider(p)}
                                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs transition-colors ${
                                  selectedCloudProvider === p
                                    ? 'border-purple-500 bg-purple-500/10 text-foreground'
                                    : 'border-white/10 bg-secondary text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                <CloudProviderIcon provider={p} size={20} />
                                {t(`cluster.cloudIAMProvider${p.toUpperCase() === 'EKS' ? 'AWS' : p.toUpperCase() === 'GKE' ? 'GKE' : p.toUpperCase() === 'AKS' ? 'AKS' : 'OpenShift'}`)}
                              </button>
                            ))}
                          </div>

                          {/* Step A: Authenticate */}
                          <div className="bg-secondary rounded-lg p-4">
                            <div className="text-xs text-muted-foreground mb-2">{t('cluster.cloudIAMStepAuth')}</div>
                            <div className="flex items-start justify-between gap-2">
                              <code className="text-sm text-foreground font-mono">{CLOUD_IAM_COMMANDS[selectedCloudProvider].auth}</code>
                              <CopyButton text={CLOUD_IAM_COMMANDS[selectedCloudProvider].auth} />
                            </div>
                          </div>

                          {/* Step B: Register cluster (skip for OpenShift — oc login does both) */}
                          {CLOUD_IAM_COMMANDS[selectedCloudProvider].register && (
                            <div className="bg-secondary rounded-lg p-4">
                              <div className="text-xs text-muted-foreground mb-2">{t('cluster.cloudIAMStepRegister')}</div>
                              <div className="flex items-start justify-between gap-2">
                                <code className="text-sm text-foreground font-mono break-all">{CLOUD_IAM_COMMANDS[selectedCloudProvider].register}</code>
                                <CopyButton text={CLOUD_IAM_COMMANDS[selectedCloudProvider].register} />
                              </div>
                            </div>
                          )}

                          <p className="text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3 border border-white/5">
                            {t('cluster.cloudIAMAutoDetect')}
                          </p>
                        </div>
                      )}

                      {/* Advanced options (only for token/certificate) */}
                      {authType !== 'cloud-iam' && (
                        <>
                          <button
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            {t('cluster.connectAdvanced')}
                          </button>

                          {showAdvanced && (
                            <div className="space-y-2 pl-1">
                              <div className="space-y-1.5">
                                <label className="text-xs text-muted-foreground">{t('cluster.connectCaLabel')}</label>
                                <textarea
                                  value={caData}
                                  onChange={(e) => setCaData(e.target.value)}
                                  rows={3}
                                  placeholder="-----BEGIN CERTIFICATE-----"
                                  className="bg-secondary rounded-lg px-4 py-2 text-xs w-full border border-white/10 focus:border-purple-500 focus:outline-none font-mono resize-none"
                                />
                              </div>
                              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={skipTls}
                                  onChange={(e) => setSkipTls(e.target.checked)}
                                  className="rounded border-white/20 bg-secondary"
                                />
                                {t('cluster.connectSkipTls')}
                              </label>
                            </div>
                          )}
                        </>
                      )}

                      <div className="flex justify-between">
                        <button
                          onClick={() => setConnectStep(1)}
                          className="px-4 py-2 text-sm font-medium rounded-lg bg-secondary text-foreground hover:bg-white/10 transition-colors border border-white/10"
                        >
                          {t('cluster.connectBack')}
                        </button>
                        {authType !== 'cloud-iam' && (
                          <button
                            onClick={() => goToConnectStep(3)}
                            disabled={authType === 'token' ? !token.trim() : (!certData.trim() || !keyData.trim())}
                            className="px-4 py-2 text-sm font-medium rounded-lg bg-secondary text-foreground hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-white/10"
                          >
                            {t('cluster.connectNext')}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Step 3: Context Settings */}
                  {connectStep === 3 && (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">{t('cluster.connectContextName')}</label>
                        <input
                          type="text"
                          value={contextName}
                          onChange={(e) => setContextName(e.target.value)}
                          placeholder="my-cluster"
                          className="bg-secondary rounded-lg px-4 py-2.5 text-sm w-full border border-white/10 focus:border-purple-500 focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">{t('cluster.connectClusterName')}</label>
                        <input
                          type="text"
                          value={clusterName}
                          onChange={(e) => setClusterName(e.target.value)}
                          placeholder="my-cluster"
                          className="bg-secondary rounded-lg px-4 py-2.5 text-sm w-full border border-white/10 focus:border-purple-500 focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">{t('cluster.connectNamespace')}</label>
                        <input
                          type="text"
                          value={namespace}
                          onChange={(e) => setNamespace(e.target.value)}
                          placeholder="default"
                          className="bg-secondary rounded-lg px-4 py-2.5 text-sm w-full border border-white/10 focus:border-purple-500 focus:outline-none"
                        />
                      </div>

                      {/* Test connection result */}
                      {testResult && (
                        <div className={`rounded-lg p-3 text-sm flex items-center gap-2 ${
                          testResult.reachable
                            ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                            : 'bg-red-500/10 border border-red-500/30 text-red-400'
                        }`}>
                          {testResult.reachable ? (
                            <>
                              <Check className="w-4 h-4 shrink-0" />
                              {t('cluster.connectTestSuccess')} — Kubernetes {testResult.serverVersion}
                            </>
                          ) : (
                            <>
                              <X className="w-4 h-4 shrink-0" />
                              {t('cluster.connectTestFailed')}: {testResult.error}
                            </>
                          )}
                        </div>
                      )}

                      {connectError && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
                          {connectError}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <button
                          onClick={() => setConnectStep(2)}
                          className="px-4 py-2 text-sm font-medium rounded-lg bg-secondary text-foreground hover:bg-white/10 transition-colors border border-white/10"
                        >
                          {t('cluster.connectBack')}
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleTestConnection}
                            disabled={connectState === 'testing' || !contextName.trim() || !clusterName.trim()}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-secondary text-foreground hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-white/10"
                          >
                            {connectState === 'testing' ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                {t('cluster.connectTesting')}
                              </>
                            ) : (
                              t('cluster.connectTestButton')
                            )}
                          </button>
                          <button
                            onClick={handleAddCluster}
                            disabled={connectState === 'adding' || !contextName.trim() || !clusterName.trim()}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {connectState === 'adding' ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                {t('cluster.connectAdding')}
                              </>
                            ) : (
                              t('cluster.connectAddButton')
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
