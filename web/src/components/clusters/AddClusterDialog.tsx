import { X, Terminal, Upload, FormInput, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { isAgentConnected } from '../../hooks/useLocalAgent'
import { CommandLineTab } from './add-cluster/CommandLineTab'
import { ImportTab } from './add-cluster/ImportTab'
import { ConnectTab } from './add-cluster/ConnectTab'
import { ConnectTabProvider } from './add-cluster/ConnectTabContext'
import { useAddClusterForm } from './useAddClusterForm'
import type { TabId } from './add-cluster/types'

interface AddClusterDialogProps {
  open: boolean
  onClose: () => void
}

export function AddClusterDialog({ open, onClose }: AddClusterDialogProps) {
  const { t } = useTranslation()
  const {
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
  } = useAddClusterForm({ open, onClose })

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
        className="absolute inset-0 bg-black/60 backdrop-blur-xs"
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
                  // Preserve each tab's form state when switching tabs so users
                  // don't lose work if they click the wrong tab by mistake (#8913).
                  // State is still cleared on dialog close (handleClose) and on
                  // successful import/add via resetImportState / resetConnectState.
                  setActiveTab(tab.id)
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

        {/* Content — fixed min-height so tabs don't resize the dialog */}
        <div className="px-6 py-5 max-h-[60vh] min-h-[340px] overflow-y-auto">
          {!isAgentConnected() && (
            <div className="flex items-start gap-3 mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
              <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-yellow-400">{t('cluster.agentRequired')}</p>
                <p className="text-muted-foreground mt-1">
                  {t('cluster.agentRequiredDesc')}{' '}
                  <a
                    href="https://github.com/kubestellar/console#install-kc-agent"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 underline"
                  >
                    {t('cluster.agentInstallLink')}
                  </a>
                </p>
              </div>
            </div>
          )}

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
            <ConnectTabProvider state={connectTabState}>
              <ConnectTab />
            </ConnectTabProvider>
          )}
        </div>
      </div>
    </div>
  )
}
