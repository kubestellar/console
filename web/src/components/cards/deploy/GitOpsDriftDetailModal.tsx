/**
 * Modal showing detailed information about a GitOps drift item.
 *
 * Opens when clicking a drift row in the GitOpsDrift card.
 * Shows drift metadata, severity, and "Sync with AI Mission" action.
 */

import { useRef, useEffect, useCallback } from 'react'
import { GitBranch, Rocket } from 'lucide-react'
import { BaseModal } from '../../../lib/modals/BaseModal'
import { StatusBadge } from '../../ui/StatusBadge'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { useMissions } from '../../../hooks/useMissions'
import { emitModalOpened, emitModalClosed, emitActionClicked } from '../../../lib/analytics'
import type { GitOpsDrift } from '../../../hooks/useMCP'

interface GitOpsDriftDetailModalProps {
  isOpen: boolean
  onClose: () => void
  drift: GitOpsDrift | null
}

const MODAL_TYPE = 'drift_detail'

const SEVERITY_COLORS: Record<GitOpsDrift['severity'], 'red' | 'orange' | 'yellow'> = {
  high: 'red',
  medium: 'orange',
  low: 'yellow',
}

const DRIFT_TYPE_LABELS: Record<GitOpsDrift['driftType'], string> = {
  modified: 'Modified',
  deleted: 'Missing in Cluster',
  added: 'Not in Git',
}

export function GitOpsDriftDetailModal({ isOpen, onClose, drift }: GitOpsDriftDetailModalProps) {
  const openTimeRef = useRef<number>(0)
  const { startMission, openSidebar } = useMissions()

  useEffect(() => {
    if (isOpen && drift) {
      openTimeRef.current = Date.now()
      emitModalOpened(MODAL_TYPE, 'gitops_drift')
    }
  }, [isOpen, drift])

  const handleClose = useCallback(() => {
    if (openTimeRef.current > 0) {
      emitModalClosed(MODAL_TYPE, Date.now() - openTimeRef.current)
      openTimeRef.current = 0
    }
    onClose()
  }, [onClose])

  const handleSyncWithAI = useCallback(() => {
    if (!drift) return
    emitActionClicked('sync', 'gitops_drift', 'deploy')
    startMission({
      title: `Sync: ${drift.resource} drift`,
      description: `${drift.driftType} drift on ${drift.kind}/${drift.resource} in ${drift.namespace} on ${drift.cluster}`,
      type: 'repair',
      cluster: drift.cluster,
      initialPrompt: `GitOps drift detected on ${drift.kind}/${drift.resource} in namespace ${drift.namespace} on cluster ${drift.cluster}.

Drift type: ${drift.driftType}
Severity: ${drift.severity}
Git version: ${drift.gitVersion}
${drift.details ? `Details: ${drift.details}` : ''}

Help me sync this resource back to the desired state:
1. Show the current state vs desired state
2. Explain what changed and why it might have drifted
3. Apply the fix to bring it back in sync
4. Verify the resource matches the git version

Please proceed step by step.`,
      context: {
        resource: drift.resource,
        kind: drift.kind,
        namespace: drift.namespace,
        cluster: drift.cluster,
        driftType: drift.driftType,
        severity: drift.severity,
      },
    })
    openSidebar()
    handleClose()
  }, [drift, startMission, openSidebar, handleClose])

  if (!drift) return null

  return (
    <BaseModal isOpen={isOpen} onClose={handleClose} size="md">
      <BaseModal.Header
        title={drift.resource}
        icon={GitBranch}
        onClose={handleClose}
        extra={
          <StatusBadge color={SEVERITY_COLORS[drift.severity] || 'yellow'} size="md">
            {drift.severity} severity
          </StatusBadge>
        }
      />
      <BaseModal.Content>
        <div className="space-y-4">
          {/* Resource info grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">Kind</h4>
              <span className="text-sm font-medium text-foreground">{drift.kind}</span>
            </div>
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">Drift Type</h4>
              <StatusBadge
                color={drift.driftType === 'deleted' ? 'red' : drift.driftType === 'added' ? 'blue' : 'yellow'}
                size="sm"
              >
                {DRIFT_TYPE_LABELS[drift.driftType] || drift.driftType}
              </StatusBadge>
            </div>
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">Namespace</h4>
              <span className="text-sm text-foreground">{drift.namespace}</span>
            </div>
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">Cluster</h4>
              <ClusterBadge cluster={drift.cluster} />
            </div>
          </div>

          {/* Git version */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-1">Git Version</h4>
            <code className="px-2 py-1 rounded bg-secondary text-purple-400 font-mono text-xs">
              {drift.gitVersion}
            </code>
          </div>

          {/* Details */}
          {drift.details && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">Details</h4>
              <div className="bg-secondary/30 rounded-lg p-3">
                <p className="text-xs text-foreground whitespace-pre-wrap">{drift.details}</p>
              </div>
            </div>
          )}

          {/* Context */}
          <div className="bg-secondary/30 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">
              This {drift.kind} has drifted from its desired state in Git.
              Use an AI Mission to investigate the cause and sync it back.
            </p>
          </div>

          {/* Sync with AI Mission */}
          <button
            onClick={handleSyncWithAI}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors text-sm"
          >
            <Rocket className="w-4 h-4" />
            Sync with AI Mission
          </button>
        </div>
      </BaseModal.Content>
      <BaseModal.Footer showKeyboardHints />
    </BaseModal>
  )
}
