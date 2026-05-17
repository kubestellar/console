import { BookOpen, Bookmark } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { StatusBadge } from '../../ui/StatusBadge'
import { ResolutionKnowledgePanel } from '../../missions/ResolutionKnowledgePanel'
import { ResolutionHistoryPanel } from '../../missions/ResolutionHistoryPanel'
import { ResolutionErrorBoundary } from '../../missions/ResolutionErrorBoundary'
import type { Mission } from '../../../hooks/useMissions'
import type { MissionExport } from '../../../lib/missions/types'
import type { Resolution, SimilarResolution } from '../../../hooks/useResolutions'
import { useTranslation } from 'react-i18next'
import { Eye, Play, Trash2 } from 'lucide-react'

export type ResolutionPanelView = 'related' | 'history'

interface MissionResolutionProps {
  savedMissions: Mission[]
  relatedResolutions: SimilarResolution[]
  allResolutionsCount: number
  resolutionPanelView: ResolutionPanelView
  onSetResolutionPanelView: (view: ResolutionPanelView) => void
  onApplyResolution: (resolution: Resolution) => void
  onSaveNewResolution: () => void
  onViewMission: (m: Mission) => void
  onRunMission: (id: string) => void
  onRemoveMission: (id: string) => void
  panelWidthClass: string
}

/**
 * Fullscreen left-sidebar panel showing saved missions and related
 * resolution knowledge for the active mission.
 */
export function MissionResolution({
  savedMissions,
  relatedResolutions,
  allResolutionsCount,
  resolutionPanelView,
  onSetResolutionPanelView,
  onApplyResolution,
  onSaveNewResolution,
  onViewMission,
  onRunMission,
  onRemoveMission,
  panelWidthClass,
}: MissionResolutionProps) {
  const { t } = useTranslation(['common'])

  return (
    <div className={cn(
      panelWidthClass,
      "border-r border-border bg-secondary/20 flex flex-col overflow-hidden shrink-0"
    )}>
      <div className="flex-1 overflow-y-auto scroll-enhanced">
        {/* Saved Missions section */}
        {savedMissions.length > 0 && (
          <div>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <Bookmark className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-semibold text-foreground">{t('layout.missionSidebar.savedMissions')}</span>
              <StatusBadge color="purple" size="xs" rounded="full" className="ml-auto">{savedMissions.length}</StatusBadge>
            </div>
            <div className="p-1.5 space-y-1">
              {savedMissions.map(m => (
                <div
                  key={m.id}
                  className="group p-2 rounded-lg hover:bg-purple-500/10 transition-colors cursor-pointer border border-transparent hover:border-purple-500/20"
                  onClick={() => onViewMission(m)}
                >
                  <div className="flex items-start gap-2">
                    <Bookmark className="w-3.5 h-3.5 text-purple-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{m.title}</p>
                      {m.importedFrom?.cncfProject && (
                        <p className="text-2xs text-muted-foreground truncate">{m.importedFrom.cncfProject}</p>
                      )}
                      {m.importedFrom?.tags && m.importedFrom.tags.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-1">
                          {m.importedFrom.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="text-[9px] px-1 py-0 bg-secondary rounded text-muted-foreground">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); onViewMission(m) }}
                      className="flex items-center gap-1 px-2 py-0.5 text-2xs text-muted-foreground hover:text-foreground rounded hover:bg-secondary transition-colors"
                    >
                      <Eye className="w-2.5 h-2.5" /> View
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onRunMission(m.id) }}
                      className="flex items-center gap-1 px-2 py-0.5 text-2xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                    >
                      <Play className="w-2.5 h-2.5" /> Run
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemoveMission(m.id) }}
                      className="flex items-center gap-1 px-2 py-0.5 text-2xs text-muted-foreground hover:text-red-400 rounded hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-2.5 h-2.5" /> Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Related Knowledge section */}
        <div className={cn(savedMissions.length > 0 && "border-t border-border")}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <BookOpen className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-semibold text-foreground">{t('layout.missionSidebar.knowledge')}</span>
          </div>
          {/* Toggle tabs */}
          <div className="flex mx-1.5 mt-1.5 bg-secondary/50 rounded-lg p-0.5">
            <button
              onClick={() => onSetResolutionPanelView('related')}
              className={cn(
                "flex-1 px-2 py-1 text-2xs font-medium rounded-md transition-colors flex items-center justify-center gap-1",
                resolutionPanelView === 'related'
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Related
              {relatedResolutions.length > 0 && (
                <span className={cn(
                  "px-1 py-0 text-[9px] rounded-full",
                  resolutionPanelView === 'related'
                    ? "bg-green-500/20 text-green-400"
                    : "bg-muted text-muted-foreground"
                )}>
                  {relatedResolutions.length}
                </span>
              )}
            </button>
            <button
              onClick={() => onSetResolutionPanelView('history')}
              className={cn(
                "flex-1 px-2 py-1 text-2xs font-medium rounded-md transition-colors flex items-center justify-center gap-1",
                resolutionPanelView === 'history'
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              All Saved
              {allResolutionsCount > 0 && (
                <span className={cn(
                  "px-1 py-0 text-[9px] rounded-full",
                  resolutionPanelView === 'history'
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                )}>
                  {allResolutionsCount}
                </span>
              )}
            </button>
          </div>
          {/* Panel content */}
          <div className="min-w-0 p-1.5">
            <ResolutionErrorBoundary>
              {resolutionPanelView === 'related' ? (
                <ResolutionKnowledgePanel
                  relatedResolutions={relatedResolutions}
                  onApplyResolution={onApplyResolution}
                  onSaveNewResolution={onSaveNewResolution}
                />
              ) : (
                <ResolutionHistoryPanel
                  onApplyResolution={onApplyResolution}
                />
              )}
            </ResolutionErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  )
}

// Re-export for consumers that previously imported from MissionSidebar
export type { MissionExport }
