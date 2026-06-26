import { useMemo } from 'react'
import { Bookmark, Eye, Play, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Mission } from '../../../hooks/useMissions'

export function useSavedMissionItems(
  savedMissions: Mission[],
  onViewMission: (mission: Mission) => void,
  onRunMission: (missionId: string) => void,
  onRemoveMission: (missionId: string) => void
) {
  const { t } = useTranslation(['common'])

  return useMemo(() => savedMissions.map(m => (
    <div
      key={m.id}
      className="group flex items-center gap-3 p-3 rounded-lg border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 transition-colors cursor-pointer"
      onClick={() => onViewMission(m)}
    >
      <Bookmark className="w-4 h-4 text-purple-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{m.title}</p>
        <p className="text-xs text-muted-foreground truncate">{m.description}</p>
        {m.importedFrom?.tags && m.importedFrom.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {m.importedFrom.tags.slice(0, 4).map(tag => (
              <span key={tag} className="text-2xs px-1.5 py-0.5 bg-secondary rounded text-muted-foreground">{tag}</span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onViewMission(m) }}
          className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-secondary transition-colors"
          title={t('layout.missionSidebar.viewMissionDetails')}
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRunMission(m.id) }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          title={t('layout.missionSidebar.runThisMission')}
        >
          <Play className="w-3 h-3" /> {t('layout.missionSidebar.run')}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemoveMission(m.id) }}
          className="p-1.5 text-muted-foreground hover:text-red-400 rounded hover:bg-red-500/10 transition-colors"
          title={t('layout.missionSidebar.removeFromLibrary')}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )), [onRunMission, onViewMission, onRemoveMission, savedMissions, t])
}
