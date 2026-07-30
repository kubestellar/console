import { Check, Play, GitBranch } from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { useSyncDialog } from './useSyncDialog'
import {
  SyncPhaseIndicator,
  DetectionPhaseContent,
  PlanPhaseContent,
  ExecutionPhaseContent,
} from './SyncDialog.parts'

interface SyncDialogProps {
  isOpen: boolean
  onClose: () => void
  appName: string
  namespace: string
  cluster: string
  repoUrl: string
  path: string
  onSyncComplete: () => void
}

export function SyncDialog({
  isOpen,
  onClose,
  appName,
  namespace,
  cluster,
  repoUrl,
  path,
  onSyncComplete,
}: SyncDialogProps) {
  const {
    phase,
    driftedResources,
    syncPlan,
    syncLogs,
    tokenCount,
    error,
    isInitializing,
    logContainerRef,
    isSyncing,
    runSync,
    handleClose,
  } = useSyncDialog({ isOpen, appName, namespace, cluster, repoUrl, path, onSyncComplete, onClose })

  return (
    <BaseModal isOpen={isOpen} onClose={handleClose} size="lg" closeOnBackdrop={!isSyncing} closeOnEscape={!isSyncing}>
      <BaseModal.Header
        title={`GitOps Sync: ${appName}`}
        description={`${namespace} • ${cluster}`}
        icon={GitBranch}
        onClose={handleClose}
        showBack={false}
      />

      <SyncPhaseIndicator phase={phase} />

      <BaseModal.Content className="max-h-[400px]">
        {phase === 'detection' && (
          <DetectionPhaseContent
            isInitializing={isInitializing}
            syncLogsLength={syncLogs.length}
          />
        )}

        {phase === 'plan' && (
          <PlanPhaseContent
            driftedResources={driftedResources}
            syncPlan={syncPlan}
          />
        )}

        {(phase === 'execution' || phase === 'complete') && (
          <ExecutionPhaseContent
            syncLogs={syncLogs}
            tokenCount={tokenCount}
            logContainerRef={logContainerRef}
          />
        )}

        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
            {error}
          </div>
        )}
      </BaseModal.Content>

      <BaseModal.Footer>
        <div className="text-xs text-muted-foreground">
          {repoUrl.replace('https://github.com/', '')}:{path}
        </div>
        <div className="flex-1" />
        <div className="flex gap-2">
          {phase === 'plan' && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={runSync}
                className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                Apply Sync
              </button>
            </>
          )}
          {phase === 'complete' && (
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-lg text-sm bg-green-500 text-foreground hover:bg-green-600 transition-colors flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Done
            </button>
          )}
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
