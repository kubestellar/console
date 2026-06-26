import { Suspense } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../../lib/cn'
import type { Mission } from '../../../hooks/useMissions'
import type { MissionExport } from '../../../lib/missions/types'
import { safeLazy } from '../../../lib/safeLazy'
import { MissionControlDialog } from '../../mission-control/MissionControlDialog'
import { MissionDetailView } from '../../missions/MissionDetailView'
import { StandaloneOrbitDialog } from '../../missions/StandaloneOrbitDialog'
import { ClusterSelectionDialog } from '../../missions/ClusterSelectionDialog'
import { SaveResolutionDialog } from '../../missions/SaveResolutionDialog'
import { ConfirmDialog } from '../../../lib/modals'

const MissionBrowser = safeLazy(() => import('../../missions/MissionBrowser'), 'MissionBrowser')

interface SavedMissionDetailModalProps {
  isMobile: boolean
  savedMissions: Mission[]
  viewingMission: MissionExport
  viewingMissionRaw: boolean
  onClose: () => void
  onRunMission: (missionId: string) => void
  onToggleRaw: () => void
}

interface MissionSidebarDialogsProps {
  browserProps: Parameters<typeof MissionBrowser>[0]
  clusterSelectionProps: Parameters<typeof ClusterSelectionDialog>[0] | null
  confirmDialogProps: Parameters<typeof ConfirmDialog>[0]
  missionControlProps: Parameters<typeof MissionControlDialog>[0]
  orbitDialogProps: Parameters<typeof StandaloneOrbitDialog>[0] | null
  saveResolutionProps: Parameters<typeof SaveResolutionDialog>[0] | null
  savedMissionDetailProps: SavedMissionDetailModalProps | null
}

function SavedMissionDetailModal({
  isMobile,
  savedMissions,
  viewingMission,
  viewingMissionRaw,
  onClose,
  onRunMission,
  onToggleRaw,
}: SavedMissionDetailModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mission details"
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-xs"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
      tabIndex={-1}
      ref={(element) => element?.focus()}
    >
      <div className={cn(
        'relative overflow-hidden rounded-xl border border-border bg-card shadow-2xl flex flex-col',
        isMobile ? 'fixed inset-2' : 'w-[900px] max-h-[85vh]'
      )}>
        <div className="flex justify-end p-3 pb-0 shrink-0">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scroll-enhanced px-6 pb-6">
          <MissionDetailView
            mission={viewingMission}
            rawContent={JSON.stringify(viewingMission, null, 2)}
            showRaw={viewingMissionRaw}
            onToggleRaw={onToggleRaw}
            onImport={() => {
              const match = savedMissions.find((mission) => mission.title === viewingMission.title)
              if (match) {
                onRunMission(match.id)
              }
              onClose()
            }}
            onBack={onClose}
            importLabel="Run"
            hideBackButton
          />
        </div>
      </div>
    </div>
  )
}

export function MissionSidebarDialogs({
  browserProps,
  clusterSelectionProps,
  confirmDialogProps,
  missionControlProps,
  orbitDialogProps,
  saveResolutionProps,
  savedMissionDetailProps,
}: MissionSidebarDialogsProps) {
  return (
    <>
      {savedMissionDetailProps && <SavedMissionDetailModal {...savedMissionDetailProps} />}

      <Suspense fallback={null}>
        <MissionBrowser {...browserProps} />
      </Suspense>

      <MissionControlDialog {...missionControlProps} />

      {orbitDialogProps && <StandaloneOrbitDialog {...orbitDialogProps} />}
      {clusterSelectionProps && <ClusterSelectionDialog {...clusterSelectionProps} />}
      {saveResolutionProps && <SaveResolutionDialog {...saveResolutionProps} />}

      <ConfirmDialog {...confirmDialogProps} />
    </>
  )
}
