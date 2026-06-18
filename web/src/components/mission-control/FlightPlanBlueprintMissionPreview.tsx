import type { Dispatch, SetStateAction } from 'react'
import { Loader2 } from 'lucide-react'

import type { MissionExport } from '../../lib/missions/types'
import { MissionDetailView } from '../missions/MissionDetailView'

interface FlightPlanBlueprintMissionPreviewProps {
  previewMission: MissionExport | null
  previewLoading: boolean
  previewRaw: boolean
  setPreviewMission: Dispatch<SetStateAction<MissionExport | null>>
  setPreviewRaw: Dispatch<SetStateAction<boolean>>
}

export function FlightPlanBlueprintMissionPreview({
  previewMission,
  previewLoading,
  previewRaw,
  setPreviewMission,
  setPreviewRaw,
}: FlightPlanBlueprintMissionPreviewProps) {
  if (!previewMission && !previewLoading) return null

  const handleClose = () => {
    setPreviewMission(null)
    setPreviewRaw(false)
  }

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
      onKeyDown={(e) => {
        if (e.defaultPrevented || e.key !== 'Escape') return
        e.stopPropagation()
        e.nativeEvent.stopImmediatePropagation()
        handleClose()
      }}
      role="dialog"
      tabIndex={-1}
      ref={(el) => el?.focus()}
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
            onToggleRaw={() => setPreviewRaw((previousValue) => !previousValue)}
            onImport={handleClose}
            onBack={handleClose}
            importLabel="Close"
            hideBackButton
          />
        ) : null}
      </div>
    </div>
  )
}
