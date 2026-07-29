import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAlerts } from '../../hooks/useAlerts'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useMissions } from '../../hooks/useMissions'
import { useMobile } from '../../hooks/useMobile'
import { ROUTES } from '../../config/routes'
import { TRANSITION_DELAY_MS } from '../../lib/constants/network'
import { cn } from '../../lib/cn'
import { useModalState } from '../../lib/modals'
import { type GroupedAlert } from '../../lib/alerts/groupAlertsForDisplay'
import { AlertBadgeDropdown, AlertBadgeTriggerButton } from './AlertBadge.parts'
import { useAlertBadgeState } from './useAlertBadgeState'

const BADGE_MAX_COUNT = 99
const ANIMATION_EXIT_DELAY_MS = 150

interface AnimationState {
  isAnimating: boolean
  direction: 'up' | 'down'
}

export function AnimatedCounter({ value, className }: { value: number; className?: string }) {
  const [displayValue, setDisplayValue] = useState(value)
  const [animState, setAnimState] = useState<AnimationState>({ isAnimating: false, direction: 'up' })
  const previousValueRef = useRef(value)
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (value !== previousValueRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAnimState({ isAnimating: true, direction: value > previousValueRef.current ? 'up' : 'down' })
      const exitTimer = setTimeout(() => {
        setDisplayValue(value)
        previousValueRef.current = value
        enterTimerRef.current = setTimeout(() => {
          setAnimState(previous => ({ ...previous, isAnimating: false }))
          enterTimerRef.current = null
        }, TRANSITION_DELAY_MS)
      }, ANIMATION_EXIT_DELAY_MS)

      return () => {
        clearTimeout(exitTimer)
        if (enterTimerRef.current !== null) {
          clearTimeout(enterTimerRef.current)
          enterTimerRef.current = null
        }
      }
    }
    return undefined
  }, [value])

  const displayText = displayValue > BADGE_MAX_COUNT ? `${BADGE_MAX_COUNT}+` : displayValue.toString()

  return (
    <span
      className={cn(
        'inline-block transition-all duration-200',
        className,
        animState.isAnimating
          ? animState.direction === 'up'
            ? 'animate-roll-up'
            : 'animate-roll-down'
          : '',
      )}
    >
      {displayText}
    </span>
  )
}

export function AlertBadge() {
  const { t } = useTranslation(['common', 'cards'])
  const navigate = useNavigate()
  const { activeAlerts, stats, acknowledgeAlerts, runAIDiagnosis } = useAlerts()
  const { drillToCluster } = useDrillDownActions()
  const { missions, setActiveMission, openSidebar } = useMissions()
  const { isMobile } = useMobile()
  const { isOpen, close, toggle } = useModalState()

  const {
    dropdownRef,
    searchQuery,
    setSearchQuery,
    severityFilter,
    setSeverityFilter,
    selectedAlertIds,
    displayedAlerts,
    unacknowledgedDisplayedIds,
    allSelected,
    someSelected,
    isGroupSelected,
    toggleAlertSelection,
    handleAcknowledge,
    handleSelectAll,
    handleDeselectAll,
    handleAcknowledgeSelected,
  } = useAlertBadgeState({ activeAlerts, acknowledgeAlerts, close, isOpen })

  const getMissionForAlert = (alert: GroupedAlert) => {
    if (!alert.aiDiagnosis?.missionId) return null
    return (missions || []).find(mission => mission.id === alert.aiDiagnosis?.missionId) || null
  }

  const handleAlertClick = (alert: GroupedAlert) => {
    close()
    if (alert.cluster) {
      drillToCluster(alert.cluster, { alert })
    }
  }

  const handleOpenMission = (event: React.MouseEvent, alert: GroupedAlert) => {
    event.stopPropagation()
    const mission = getMissionForAlert(alert)
    if (mission) {
      setActiveMission(mission.id)
      openSidebar()
      close()
    }
  }

  const handleDiagnose = (event: React.MouseEvent | React.KeyboardEvent<HTMLDivElement>, alertId: string) => {
    event.stopPropagation()
    runAIDiagnosis(alertId)
    close()
  }

  const handleOpenAlertsDashboard = () => {
    close()
    navigate(ROUTES.ALERTS)
  }

  return (
    <div className="relative" data-tour="alerts">
      <AlertBadgeTriggerButton
        stats={stats}
        onToggle={toggle}
        renderCount={(value) => <AnimatedCounter value={value} />}
      />

      <AlertBadgeDropdown
        isOpen={isOpen}
        isMobile={isMobile}
        dropdownRef={dropdownRef}
        stats={stats}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        severityFilter={severityFilter}
        onSeverityFilterChange={setSeverityFilter}
        displayedAlerts={displayedAlerts}
        unacknowledgedDisplayedIds={unacknowledgedDisplayedIds}
        allSelected={allSelected}
        someSelected={someSelected}
        selectedCount={selectedAlertIds.size}
        close={close}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        onAcknowledgeSelected={handleAcknowledgeSelected}
        getMissionForAlert={getMissionForAlert}
        isGroupSelected={isGroupSelected}
        onAlertClick={handleAlertClick}
        onToggleAlertSelection={toggleAlertSelection}
        onAcknowledge={handleAcknowledge}
        onOpenMission={handleOpenMission}
        onDiagnose={handleDiagnose}
        onOpenAlertsDashboard={handleOpenAlertsDashboard}
        t={t}
      />
    </div>
  )
}
