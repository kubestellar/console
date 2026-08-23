/**
 * FlightPlanMissionPreview — modal preview of the KB mission for a project.
 */

import { Loader2 } from 'lucide-react'
import { MissionDetailView } from '../missions/MissionDetailView'
import type { MissionExport } from '../../lib/missions/types'

interface FlightPlanMissionPreviewProps {
  mission: MissionExport | null
  loading: boolean
  showRaw: boolean
  onToggleRaw: () => void
  onClose: () => void
}

export function FlightPlanMissionPreview({
  mission,
  loading,
  showRaw,
  onToggleRaw,
  onClose }: FlightPlanMissionPreviewProps) {
  if (!mission && !loading) return null

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-xs"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={(e) => {
        if (e.defaultPrevented || e.key !== 'Escape') return
        e.stopPropagation()
        e.nativeEvent.stopImmediatePropagation()
        onClose()
      }}
      role="dialog"
      tabIndex={-1}
      ref={(el) => el?.focus()}
    >
      <div className="w-full max-w-4xl max-h-[85vh] overflow-y-auto bg-card rounded-xl border border-border shadow-2xl">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading mission...
          </div>
        ) : mission ? (
          <MissionDetailView
            mission={mission}
            rawContent={JSON.stringify(mission, null, 2)}
            showRaw={showRaw}
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
