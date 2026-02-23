import { useState, useCallback } from 'react'
import { X, Terminal, Upload, FormInput, Copy, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface AddClusterDialogProps {
  open: boolean
  onClose: () => void
}

type TabId = 'command-line' | 'import' | 'connect'

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

  if (!open) return null

  const tabs: { id: TabId; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
    { id: 'command-line', label: t('cluster.addClusterCommandLine'), icon: <Terminal className="w-4 h-4" /> },
    { id: 'import', label: t('cluster.addClusterImport'), icon: <Upload className="w-4 h-4" />, disabled: true },
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
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Upload className="w-10 h-10 text-muted-foreground mb-3 opacity-50" />
              <p className="text-sm text-muted-foreground">
                {t('cluster.addClusterComingSoon')} — {t('cluster.addClusterImportDesc')}
              </p>
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
