import { Loader2 } from 'lucide-react'
import type { MissionExport } from '../../lib/missions/types'
import { MissionDetailView } from '../missions/MissionDetailView'

interface FlightPlanMissionPreviewModalProps {
  previewMission: MissionExport | null
  previewLoading: boolean
  previewRaw: boolean
  onClose: () => void
  onToggleRaw: () => void
}

export function FlightPlanMissionPreviewModal({
  previewMission,
  previewLoading,
  previewRaw,
  onClose,
  onToggleRaw,
}: FlightPlanMissionPreviewModalProps) {
  if (!previewMission && !previewLoading) return null

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-xs"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
      onKeyDown={(event) => {
        if (event.defaultPrevented || event.key !== 'Escape') return
        event.stopPropagation()
        event.nativeEvent.stopImmediatePropagation()
        onClose()
      }}
      role="dialog"
      tabIndex={-1}
      ref={(element) => element?.focus()}
    >
      <div className="w-full max-w-4xl max-h-[85vh] overflow-y-auto bg-card rounded-xl border border-border shadow-2xl">
        {previewLoading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading mission...
          </div>
        ) : previewMission ? (
          <MissionDetailView
            mission={previewMission}
            rawContent={JSON.stringify(previewMission, null, 2)}
            showRaw={previewRaw}
            onToggleRaw={onToggleRaw}
            onImport={onClose}
            onBack={onClose}
            importLabel="Close"
            hideBackButton
          />
        ) : null}
      </div>
    </div>
  )
}
