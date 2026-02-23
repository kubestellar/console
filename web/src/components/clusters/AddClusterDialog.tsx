import { useState, useCallback, useRef } from 'react'
import { X, Terminal, Upload, FormInput, Copy, Check, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LOCAL_AGENT_HTTP_URL } from '../../lib/constants'

interface AddClusterDialogProps {
  open: boolean
  onClose: () => void
}

type TabId = 'command-line' | 'import' | 'connect'

type ImportState = 'idle' | 'previewing' | 'previewed' | 'importing' | 'done' | 'error'

interface PreviewContext {
  context: string
  cluster: string
  server: string
  isNew: boolean
}

const COMMANDS = [
  {
    comment: '# 1. Add cluster credentials',
    command: 'kubectl config set-cluster <cluster-name> --server=https://<api-server>:6443',
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(body.error || res.statusText)
      }
      const data = await res.json()
      const count = data.importedCount ?? previewContexts.filter((c) => c.isNew).length
      setImportedCount(count)
      setImportState('done')
      setTimeout(() => {
        resetImportState()
        onClose()
      }, 1500)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
      setImportState('error')
    }
  }, [kubeconfigYaml, previewContexts, resetImportState, onClose])

  if (!open) return null

  const newCount = previewContexts.filter((c) => c.isNew).length

  const tabs: { id: TabId; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
    { id: 'command-line', label: t('cluster.addClusterCommandLine'), icon: <Terminal className="w-4 h-4" /> },
    { id: 'import', label: t('cluster.addClusterImport'), icon: <Upload className="w-4 h-4" /> },
    { id: 'connect', label: t('cluster.addClusterConnect'), icon: <FormInput className="w-4 h-4" />, disabled: true },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-2xl mx-4 bg-card border border-white/10 rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-foreground">{t('cluster.addClusterTitle')}</h2>
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
              onClick={() => !tab.disabled && setActiveTab(tab.id)}
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
                            {ctx.isNew ? (
                              <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded ml-3 shrink-0">
                                {t('cluster.importNew')}
                              </span>
                            ) : (
                              <span className="bg-white/10 text-muted-foreground text-xs px-2 py-0.5 rounded ml-3 shrink-0">
                                {t('cluster.importExists')}
                              </span>
                            )}
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
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FormInput className="w-10 h-10 text-muted-foreground mb-3 opacity-50" />
              <p className="text-sm text-muted-foreground">
                {t('cluster.addClusterComingSoon')} — {t('cluster.addClusterConnectDesc')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
