/**
 * Modal showing detailed information about a Helm history entry.
 *
 * Opens when clicking a history entry in the HelmHistory card.
 * Shows revision details and "Rollback with AI Mission" action.
 */

import { useRef, useEffect } from 'react'
import { RotateCcw, Rocket } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BaseModal } from '../../../lib/modals/BaseModal'
import { StatusBadge } from '../../ui/StatusBadge'
import { useMissions } from '../../../hooks/useMissions'
import { emitModalOpened, emitModalClosed, emitActionClicked } from '../../../lib/analytics'
import type { HelmHistoryEntry } from '../../../hooks/useMCP'

interface HelmHistoryDetailModalProps {
  isOpen: boolean
  onClose: () => void
  entry: HelmHistoryEntry | null
  releaseName: string
  clusterName: string
  namespace: string
  currentRevision?: number
}

const MODAL_TYPE = 'helm_history'

const STATUS_COLORS: Record<string, 'green' | 'red' | 'blue' | 'gray'> = {
  deployed: 'green',
  failed: 'red',
  'pending-rollback': 'blue',
  'pending-upgrade': 'blue',
  superseded: 'gray' }

export function HelmHistoryDetailModal({
  isOpen, onClose, entry, releaseName, clusterName, namespace, currentRevision }: HelmHistoryDetailModalProps) {
  const openTimeRef = useRef<number>(0)
  const { startMission, openSidebar } = useMissions()
  const { t, i18n } = useTranslation(['cards', 'common'])

  useEffect(() => {
    if (isOpen && entry) {
      openTimeRef.current = Date.now()
      emitModalOpened(MODAL_TYPE, 'helm_history')
    }
  }, [isOpen, entry])

  const handleClose = () => {
    if (openTimeRef.current > 0) {
      emitModalClosed(MODAL_TYPE, Date.now() - openTimeRef.current)
      openTimeRef.current = 0
    }
    onClose()
  }

  const handleRollback = () => {
    if (!entry) return
    emitActionClicked('rollback', 'helm_history', 'deploy')
    handleClose() // Close modal so mission sidebar is visible
    startMission({
      title: `Rollback: ${releaseName} to rev ${entry.revision}`,
      description: `Rollback Helm release ${releaseName} in ${namespace} on ${clusterName} to revision ${entry.revision}`,
      type: 'repair',
      cluster: clusterName,
      initialPrompt: `I want to rollback Helm release '${releaseName}' in namespace ${namespace} on cluster ${clusterName} from revision ${currentRevision || 'current'} to revision ${entry.revision}.

Release details:
- Chart: ${entry.chart}
- App Version: ${entry.app_version}
- Status at rev ${entry.revision}: ${entry.status}
- Description: ${entry.description || 'N/A'}

Help me verify it's safe and execute the rollback:
1. Check the current state of the release
2. Compare what will change between the current revision and revision ${entry.revision}
3. Execute the rollback with \`helm rollback ${releaseName} ${entry.revision} -n ${namespace}\`
4. Verify the rollback was successful

Please proceed step by step.`,
      context: {
        release: releaseName,
        namespace,
        cluster: clusterName,
        targetRevision: entry.revision,
        currentRevision } })
    openSidebar()
  }

  if (!entry) return null

  const isCurrent = entry.status === 'deployed'
  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp)
    // Issue 9285: use the active i18n locale so dates match the user's
    // language (previously hardcoded to en-US).
    return date.toLocaleDateString(i18n.language, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit' })
  }

  return (
    <BaseModal isOpen={isOpen} onClose={handleClose} size="md" closeOnBackdrop={false}>
      <BaseModal.Header
        title={`${releaseName} — Rev ${entry.revision}`}
        icon={RotateCcw}
        onClose={handleClose}
        extra={
          <StatusBadge color={STATUS_COLORS[entry.status] || 'gray'} size="md">
            {entry.status}
          </StatusBadge>
        }
      />
      <BaseModal.Content>
        <div className="space-y-4">
          {/* Revision info grid — Issue 9285: labels now i18n */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">{t('cards:helmHistoryModal.chart')}</h4>
              <span className="text-sm font-medium text-foreground">{entry.chart}</span>
            </div>
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">{t('cards:helmHistoryModal.appVersion')}</h4>
              <span className="text-sm text-foreground">{entry.app_version || t('cards:helmHistoryModal.notAvailable')}</span>
            </div>
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">{t('cards:helmHistoryModal.updated')}</h4>
              <span className="text-sm text-foreground">{formatDate(entry.updated)}</span>
            </div>
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">{t('cards:helmHistoryModal.cluster')}</h4>
              <span className="text-sm text-foreground">{clusterName}</span>
            </div>
          </div>

          {/* Description */}
          {entry.description && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">{t('cards:helmHistoryModal.description')}</h4>
              <div className="bg-secondary/30 rounded-lg p-3">
                <p className="text-xs text-foreground">{entry.description}</p>
              </div>
            </div>
          )}

          {/* Current badge */}
          {isCurrent && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
              <span className="text-sm font-medium text-green-400">{t('cards:helmHistoryModal.currentlyDeployed')}</span>
            </div>
          )}

          {/* Rollback action (only for non-current revisions) */}
          {!isCurrent && (
            <>
              <div className="bg-secondary/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">
                  {t('cards:helmHistoryModal.rollbackDescription', { revision: entry.revision })}
                </p>
              </div>
              <button
                onClick={handleRollback}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors text-sm"
              >
                <Rocket className="w-4 h-4" />
                {t('cards:helmHistoryModal.rollbackWithAI')}
              </button>
            </>
          )}
        </div>
      </BaseModal.Content>
      <BaseModal.Footer showKeyboardHints />
    </BaseModal>
  )
}
