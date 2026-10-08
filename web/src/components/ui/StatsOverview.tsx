import { useState } from 'react'
import { useModalState } from '../../lib/modals'
import { useTranslation } from 'react-i18next'
import { Settings, Activity, ChevronDown, ChevronRight, FlaskConical } from 'lucide-react'
import { Button } from './Button'
import { StatusBadge } from './StatusBadge'
import type { DashboardStatsType, StatDisplayMode } from './StatsBlockDefinitions'
import { StatsConfigModal, useStatsConfig } from './StatsConfig'
import { useLocalAgent, wasAgentEverConnected } from '../../hooks/useLocalAgent'
import { isInClusterMode } from '../../hooks/useBackendHealth'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useIsModeSwitching } from '../../lib/unified/demo'
import { useStatHistory } from '../../hooks/useStatHistory'
import { safeGetJSON, safeSetJSON } from '../../lib/utils/localStorage'
import { isLocalAgentSuppressed } from '../../lib/constants'
import type { StatBlockValue } from './StatsOverview.types'
import { StatBlock } from './StatsOverview.parts'

export type { StatBlockValue } from './StatsOverview.types'

interface StatsOverviewProps {
  /** Dashboard type for loading config */
  dashboardType: DashboardStatsType
  /** Function to get value for each stat block by ID */
  getStatValue: (blockId: string) => StatBlockValue
  /** Whether the dashboard has actual data loaded */
  hasData?: boolean
  /** Whether to show loading skeletons */
  isLoading?: boolean
  /** Whether the stats section is collapsible (default: true) */
  collapsible?: boolean
  /** Whether stats are expanded by default (default: true) */
  defaultExpanded?: boolean
  /** Storage key for collapsed state */
  collapsedStorageKey?: string
  /** Last updated timestamp */
  lastUpdated?: Date | null
  /** Additional class names */
  className?: string
  /** Title for the stats section */
  title?: string
  /** Whether to show the configure button */
  showConfigButton?: boolean
  /** Whether the stats are demo data (shows yellow border + badge) */
  isDemoData?: boolean
}

/**
 * Reusable stats overview component for all dashboards.
 * Provides drag-and-drop reordering, visibility toggles, and persistent configuration.
 */
export function StatsOverview({
  dashboardType,
  getStatValue,
  hasData = true,
  isLoading = false,
  collapsible = true,
  defaultExpanded = true,
  collapsedStorageKey,
  className = '',
  title,
  showConfigButton = true,
  isDemoData = false }: StatsOverviewProps) {
  const { t } = useTranslation()
  const resolvedTitle = title ?? t('statsOverview.title')
  const { blocks, saveBlocks, visibleBlocks, defaultBlocks } = useStatsConfig(dashboardType)
  const { status: agentStatus } = useLocalAgent()
  const { isDemoMode } = useDemoMode()
  const isModeSwitching = useIsModeSwitching()

  // When demo mode is OFF and agent is confirmed disconnected, force skeleton display
  // Don't force skeleton during 'connecting' - show cached data to prevent flicker
  const isAgentOffline = agentStatus === 'disconnected'
  const forceLoadingForOffline = !isDemoMode
    && !isDemoData
    && isAgentOffline
    && !isInClusterMode()
    && !isLocalAgentSuppressed()
    && !wasAgentEverConnected()
  // Show skeleton during mode switching for smooth transitions
  const effectiveIsLoading = isLoading || forceLoadingForOffline || isModeSwitching
  const effectiveHasData = forceLoadingForOffline ? false : hasData
  const { isOpen, open: openConfig, close: closeConfig } = useModalState()

  // Sparkline history buffer — accumulates values over the session
  const { getHistory } = useStatHistory(
    dashboardType,
    getStatValue,
    visibleBlocks.map(b => b.id),
    effectiveIsLoading,
  )

  // Handle per-block display mode changes — persists to localStorage (synced to agent)
  const handleDisplayModeChange = (blockId: string, mode: StatDisplayMode) => {
    const updated = blocks.map(b => b.id === blockId ? { ...b, displayMode: mode } : b)
    saveBlocks(updated)
    window.dispatchEvent(new CustomEvent('kubestellar-settings-changed'))
  }

  // Manage collapsed state with localStorage persistence.
  // Storage key ends in "-stats-collapsed", so the stored value represents
  // the COLLAPSED state (true = collapsed). Previously this file stored
  // `isExpanded` under the same key, which inverted across reloads and
  // disagreed with sibling components that use the collapsed sense.
  const storageKey = collapsedStorageKey || `kubestellar-${dashboardType}-stats-collapsed`
  const [isExpanded, setIsExpanded] = useState(() => {
    const savedCollapsed = safeGetJSON<boolean>(storageKey)
    return savedCollapsed === null || savedCollapsed === undefined
      ? defaultExpanded
      : !savedCollapsed
  })

  const toggleExpanded = () => {
    const newValue = !isExpanded
    setIsExpanded(newValue)
    // Store COLLAPSED state to match the storage-key semantics.
    safeSetJSON(storageKey, !newValue)
  }

  // Dynamic grid columns based on visible blocks.
  // Mobile: max 2 columns, tablet+: responsive based on count.
  // - ≤4 blocks: 4 columns at md+.
  // - 5 blocks: 5 columns at lg+.
  // - 6 blocks: keep 3x2 through lg, switch to 6 across at xl to avoid a
  //   5+1 orphan layout at 1440px.
  // - 7+ blocks: cap at 4 columns at lg, expand to 5 at xl for readability.
  const gridCols = visibleBlocks.length <= 4 ? 'grid-cols-2 md:grid-cols-4' :
    visibleBlocks.length <= 5 ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5' :
    visibleBlocks.length === 6 ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6' :
    'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'

  return (
    <div className={`mb-6 ${className}`}>
      {/* Header with collapse toggle and settings */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {collapsible ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleExpanded}
              className="font-medium"
              icon={<Activity className="w-4 h-4" />}
              iconRight={isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            >
              {resolvedTitle}
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Activity className="w-4 h-4" />
              <span>{resolvedTitle}</span>
            </div>
          )}
          {isDemoData && (
            <StatusBadge
              color="yellow"
              size="xs"
              variant="outline"
              rounded="full"
              icon={<FlaskConical className="w-2.5 h-2.5" />}
              title={t('statsOverview.demoTooltip', 'Showing sample data — connect clusters to see live metrics')}
            >
              {t('statsOverview.demo')}
            </StatusBadge>
          )}

        </div>
        {showConfigButton && isExpanded && (
          <Button
            variant="ghost"
            size="sm"
            onClick={openConfig}
            className="p-1"
            title={t('statsOverview.configureStats')}
            icon={<Settings className="w-4 h-4" />}
          />
        )}
      </div>

      {/* Stats grid */}
      {(!collapsible || isExpanded) && (
        <div className={`grid ${gridCols} gap-4`}>
          {visibleBlocks.map(block => {
            const statValue = effectiveIsLoading ? undefined : getStatValue(block.id)
            const data: StatBlockValue = effectiveIsLoading
              ? { value: '', sublabel: undefined }
              : (statValue ?? { value: '', sublabel: t('statsOverview.notAvailable') })
            return (
              <StatBlock
                key={block.id}
                block={block}
                data={data}
                hasData={effectiveHasData && !effectiveIsLoading && statValue?.value !== undefined}
                isLoading={effectiveIsLoading}
                history={getHistory(block.id)}
                onDisplayModeChange={(mode) => handleDisplayModeChange(block.id, mode)}
              />
            )
          })}
        </div>
      )}

      {/* Config modal */}
      <StatsConfigModal
        isOpen={isOpen}
        onClose={closeConfig}
        blocks={blocks}
        onSave={saveBlocks}
        defaultBlocks={defaultBlocks}
        title={`${t('actions.configure')} ${resolvedTitle}`}
      />
    </div>
  )
}
