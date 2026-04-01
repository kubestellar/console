import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, Lightbulb } from 'lucide-react'
import { useSnoozedCards, SnoozedSwap } from '../../hooks/useSnoozedCards'
import { useSnoozedRecommendations, SnoozedRecommendation } from '../../hooks/useSnoozedRecommendations'
import { useSnoozedMissions, SnoozedMission } from '../../hooks/useSnoozedMissions'
import { StatusBadge } from '../ui/StatusBadge'
import { POLL_INTERVAL_SLOW_MS } from '../../lib/constants/network'
import { SnoozedItem } from './SnoozedItem'
import { SnoozedRecommendationItem } from './SnoozedRecommendationItem'
import { SnoozedMissionItem } from './SnoozedMissionItem'

interface SnoozedCardsProps {
  onApplySwap?: (swap: SnoozedSwap) => void
  onApplyRecommendation?: (rec: SnoozedRecommendation) => void
  onApplyMission?: (mission: SnoozedMission) => void
}

export function SnoozedCards({ onApplySwap, onApplyRecommendation, onApplyMission }: SnoozedCardsProps) {
  const { t } = useTranslation()
  const { snoozedSwaps, unsnoozeSwap, dismissSwap } = useSnoozedCards()
  const { snoozedRecommendations, unsnooozeRecommendation, dismissSnoozedRecommendation } = useSnoozedRecommendations()
  const { snoozedMissions, unsnoozeMission, dismissMission } = useSnoozedMissions()
  const [, forceUpdate] = useState(0)

  // Update every minute to refresh time display
  useEffect(() => {
    const interval = setInterval(() => forceUpdate((n) => n + 1), POLL_INTERVAL_SLOW_MS)
    return () => clearInterval(interval)
  }, [])

  const hasSwaps = snoozedSwaps.length > 0
  const hasRecs = snoozedRecommendations.length > 0
  const hasMissions = snoozedMissions.length > 0

  // Show placeholder when nothing is snoozed
  if (!hasSwaps && !hasRecs && !hasMissions) {
    return (
      <div className="mt-4">
        <div className="flex items-center gap-2 px-3 mb-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t('sidebar.snoozedItems')}
          </h4>
        </div>
        <div className="mx-2 p-3 rounded-lg border border-dashed border-border/50 text-center">
          <p className="text-xs text-muted-foreground">
            {t('sidebar.noSnoozedItems')}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {t('sidebar.snoozedItemsHint')}
          </p>
        </div>
      </div>
    )
  }

  const handleApplySwap = (swap: SnoozedSwap) => {
    unsnoozeSwap(swap.id)
    onApplySwap?.(swap)
  }

  const handleApplyRecommendation = (rec: SnoozedRecommendation) => {
    unsnooozeRecommendation(rec.id)
    onApplyRecommendation?.(rec)
  }

  const handleApplyMission = (mission: SnoozedMission) => {
    unsnoozeMission(mission.id)
    onApplyMission?.(mission)
  }

  const handleDismissMission = (missionId: string, suggestionId: string) => {
    unsnoozeMission(missionId)
    dismissMission(suggestionId)
  }

  return (
    <>
    {/* Snoozed Missions (Suggested Actions) */}
    {hasMissions && (
    <div className="mt-4">
      <div className="flex items-center gap-2 px-3 mb-2">
        <Lightbulb className="w-4 h-4 text-purple-400" />
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {t('sidebar.snoozedActions')}
        </h4>
        <StatusBadge color="purple" className="ml-auto">{snoozedMissions.length}</StatusBadge>
      </div>
      <div className="space-y-2">
        {snoozedMissions.map((mission) => (
          <SnoozedMissionItem
            key={mission.id}
            mission={mission}
            onApply={() => handleApplyMission(mission)}
            onDismiss={() => handleDismissMission(mission.id, mission.suggestion.id)}
          />
        ))}
      </div>
    </div>
    )}

    {/* Snoozed Recommendations */}
    {hasRecs && (
    <div className="mt-4">
      <div className="flex items-center gap-2 px-3 mb-2">
        <Lightbulb className="w-4 h-4 text-yellow-400" />
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {t('sidebar.snoozedRecommendations')}
        </h4>
        <StatusBadge color="yellow" className="ml-auto">{snoozedRecommendations.length}</StatusBadge>
      </div>
      <div className="space-y-2">
        {snoozedRecommendations.map((rec) => (
          <SnoozedRecommendationItem
            key={rec.id}
            rec={rec}
            onApply={() => handleApplyRecommendation(rec)}
            onDismiss={() => dismissSnoozedRecommendation(rec.id)}
          />
        ))}
      </div>
    </div>
    )}

    {/* Snoozed Card Swaps */}
    {hasSwaps && (
    <div className="mt-4">
      <div className="flex items-center gap-2 px-3 mb-2">
        <Clock className="w-4 h-4 text-purple-400" />
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {t('sidebar.snoozedSwaps')}
        </h4>
        <StatusBadge color="purple" className="ml-auto">{snoozedSwaps.length}</StatusBadge>
      </div>
      <div className="space-y-2">
        {snoozedSwaps.map((swap) => (
          <SnoozedItem
            key={swap.id}
            swap={swap}
            onApply={() => handleApplySwap(swap)}
            onDismiss={() => dismissSwap(swap.id)}
          />
        ))}
      </div>
    </div>
    )}
    </>
  )
}
