import type { ClusterInfo } from '../../hooks/mcp/types'
import type { GPUNode, NVIDIAOperatorStatus } from '../../hooks/mcp/compute'
import { ClusterDetailModal } from './ClusterDetailModal'
import { AddClusterDialog } from './AddClusterDialog'
import { RenameModal, RemoveClusterDialog, GPUDetailModal } from './components'
import { ApiKeyPromptModal } from '../cards/console-missions/shared'

export interface ClusterModalsProps {
  clusters: ClusterInfo[]
  selectedCluster: string | null
  onCloseClusterDetail: () => void
  onOpenRenameFromDetail: (name: string) => void
  onOpenRemoveFromDetail: (name: string) => void
  isConnected: boolean
  renamingCluster: string | null
  onCloseRename: () => void
  onRename: (oldName: string, newName: string) => Promise<void>
  removingCluster: string | null
  onCloseRemove: () => void
  onConfirmRemove: (contextName: string) => Promise<void>
  showGPUModal: boolean
  gpuNodes: GPUNode[]
  gpuLoading: boolean
  gpuError: string | null
  gpuRefetch: () => void
  onCloseGPUModal: () => void
  nvidiaOperators: NVIDIAOperatorStatus[]
  pruneShowKeyPrompt: boolean
  pruneDismissPrompt: () => void
  pruneGoToSettings: () => void
  createShowKeyPrompt: boolean
  createDismissPrompt: () => void
  createGoToSettings: () => void
  showAddCluster: boolean
  onCloseAddCluster: () => void
}

/**
 * Renders every modal/dialog associated with the Clusters page (cluster
 * detail, rename, remove, GPU detail, API key prompts, add-cluster dialog).
 * Extracted from Clusters.tsx to reduce the size of the page component (#21617).
 */
export function ClusterModals({
  clusters,
  selectedCluster,
  onCloseClusterDetail,
  onOpenRenameFromDetail,
  onOpenRemoveFromDetail,
  isConnected,
  renamingCluster,
  onCloseRename,
  onRename,
  removingCluster,
  onCloseRemove,
  onConfirmRemove,
  showGPUModal,
  gpuNodes,
  gpuLoading,
  gpuError,
  gpuRefetch,
  onCloseGPUModal,
  nvidiaOperators,
  pruneShowKeyPrompt,
  pruneDismissPrompt,
  pruneGoToSettings,
  createShowKeyPrompt,
  createDismissPrompt,
  createGoToSettings,
  showAddCluster,
  onCloseAddCluster,
}: ClusterModalsProps) {
  return (
    <>
      {/* Cluster Detail Modal */}
      {selectedCluster && (
        <ClusterDetailModal
          clusterName={selectedCluster}
          clusterUser={clusters.find(c => c.name === selectedCluster)?.user}
          onClose={onCloseClusterDetail}
          onRename={onOpenRenameFromDetail}
          onRemove={isConnected ? onOpenRemoveFromDetail : undefined}
        />
      )}

      {/* Rename Modal */}
      {renamingCluster && (
        <RenameModal
          clusterName={renamingCluster}
          currentDisplayName={clusters.find(c => c.name === renamingCluster)?.context || renamingCluster}
          onClose={onCloseRename}
          onRename={onRename}
        />
      )}

      {/* Remove Offline Cluster Modal (#5901) */}
      {removingCluster && (() => {
        const target = clusters.find(c => c.name === removingCluster)
        // Prefer the kubeconfig context string (what the backend expects); fall back to name
        const ctxName = target?.context || removingCluster
        const displayName = target?.context || target?.name || removingCluster
        return (
          <RemoveClusterDialog
            contextName={ctxName}
            displayName={displayName}
            onClose={onCloseRemove}
            onConfirm={onConfirmRemove}
          />
        )
      })()}

      {/* GPU Detail Modal */}
      {showGPUModal && (
        <GPUDetailModal
          gpuNodes={gpuNodes}
          isLoading={gpuLoading}
          error={gpuError}
          onRefresh={gpuRefetch}
          onClose={onCloseGPUModal}
          operatorStatus={nvidiaOperators}
        />
      )}

      {/* API Key Prompt for Prune action */}
      <ApiKeyPromptModal isOpen={pruneShowKeyPrompt} onDismiss={pruneDismissPrompt} onGoToSettings={pruneGoToSettings} />

      {/* API Key Prompt for Create Cluster with AI action (#6454) */}
      <ApiKeyPromptModal isOpen={createShowKeyPrompt} onDismiss={createDismissPrompt} onGoToSettings={createGoToSettings} />

      {/* Add Cluster Dialog */}
      <AddClusterDialog open={showAddCluster} onClose={onCloseAddCluster} />
    </>
  )
}
