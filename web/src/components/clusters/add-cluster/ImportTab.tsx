import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, Check, Loader2 } from 'lucide-react'
import { StatusBadge } from '../../ui/StatusBadge'
import { ConfirmDialog } from '../../../lib/modals/ConfirmDialog'
import type { ImportState, PreviewContext } from './types'

interface ImportTabProps {
  kubeconfigYaml: string
  setKubeconfigYaml: (value: string) => void
  importState: ImportState
  setImportState: (state: ImportState) => void
  previewContexts: PreviewContext[]
  setPreviewContexts: (contexts: PreviewContext[]) => void
  errorMessage: string
  setErrorMessage: (msg: string) => void
  importedCount: number
  fileInputRef: React.RefObject<HTMLInputElement | null>
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  handlePreview: () => void
  handleImport: () => void
}

export function ImportTab({
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
}: ImportTabProps) {
  const { t } = useTranslation()
  const [pendingUploadEvent, setPendingUploadEvent] = useState<React.ChangeEvent<HTMLInputElement> | null>(null)

  const newCount = previewContexts.filter((c) => c.isNew).length

  // Wrap the upload handler to confirm before overwriting existing pasted YAML.
  // Fixes #8917 — uploading a file used to silently replace pasted content.
  // Replaces window.confirm() with the themed ConfirmDialog (accessibility fix).
  const handleFileUploadWithConfirm = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (kubeconfigYaml.trim().length > 0) {
      setPendingUploadEvent(e)
      return
    }
    handleFileUpload(e)
  }

  const handleConfirmOverwrite = () => {
    if (pendingUploadEvent) {
      handleFileUpload(pendingUploadEvent)
    }
    setPendingUploadEvent(null)
  }

  const handleCancelOverwrite = () => {
    // Clear the file input so re-selecting the same file still fires onChange next time.
    if (fileInputRef.current) fileInputRef.current.value = ''
    setPendingUploadEvent(null)
  }

  return (
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
              rows={8}
              placeholder="apiVersion: v1&#10;kind: Config&#10;..."
              className="bg-secondary rounded-lg p-4 font-mono text-sm w-full resize-y border border-border dark:border-white/10 focus:border-purple-500 focus:outline-hidden min-h-[180px]"
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".yaml,.yml,.conf,.config"
              onChange={handleFileUploadWithConfirm}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-secondary text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors border border-border dark:border-white/10"
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
                    key={ctx.contextName}
                    className="flex items-center justify-between bg-secondary/50 rounded-lg px-4 py-2.5"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{ctx.contextName}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {ctx.clusterName} — {ctx.serverUrl}
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
                        <span className="bg-black/5 dark:bg-white/10 text-muted-foreground text-xs px-2 py-0.5 rounded">
                          {t('cluster.importExists')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {newCount === 0 ? (
                <p className="text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3 border border-border/30 dark:border-white/5">
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
      <ConfirmDialog
        isOpen={pendingUploadEvent !== null}
        onClose={handleCancelOverwrite}
        onConfirm={handleConfirmOverwrite}
        title={t('cluster.importOverwriteTitle')}
        message={t('cluster.importOverwriteConfirm')}
        confirmLabel={t('actions.replace')}
        variant="warning"
      />
    </div>
  )
}
