import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useModalState } from '../../lib/modals'
import { useLocalAgent, wasAgentEverConnected } from '../../hooks/useLocalAgent'
import { isInClusterMode } from '../../hooks/useBackendHealth'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useIsModeSwitching } from '../../lib/unified/demo'
import { useStatHistory } from '../../hooks/useStatHistory'
import { safeGetJSON, safeSetJSON } from '../../lib/utils/localStorage'
import { isLocalAgentSuppressed } from '../../lib/constants'
import { StatsConfigModal, useStatsConfig } from './StatsConfig'
import { StatTile, StatsOverviewHeader, getStatsGridColumns } from './StatsOverview.parts'
import type { DashboardStatsType, StatBlockValue, StatDisplayMode } from './Stats.types'

export type { StatBlockValue }

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
  isDemoData = false,
}: StatsOverviewProps) {
  const { t } = useTranslation()
  const resolvedTitle = title ?? t('statsOverview.title')
  const { blocks, saveBlocks, visibleBlocks, defaultBlocks } = useStatsConfig(dashboardType)
  const { status: agentStatus } = useLocalAgent()
  const { isDemoMode } = useDemoMode()
  const isModeSwitching = useIsModeSwitching()

  const isAgentOffline = agentStatus === 'disconnected'
  const forceLoadingForOffline = !isDemoMode
    && !isDemoData
    && isAgentOffline
    && !isInClusterMode()
    && !isLocalAgentSuppressed()
    && !wasAgentEverConnected()

  const effectiveIsLoading = isLoading || forceLoadingForOffline || isModeSwitching
  const effectiveHasData = forceLoadingForOffline ? false : hasData
  const { isOpen, open: openConfig, close: closeConfig } = useModalState()

  const { getHistory } = useStatHistory(
    dashboardType,
    getStatValue,
    visibleBlocks.map(block => block.id),
    effectiveIsLoading,
  )

  const handleDisplayModeChange = (blockId: string, mode: StatDisplayMode) => {
    const updatedBlocks = blocks.map(block => block.id === blockId ? { ...block, displayMode: mode } : block)
    saveBlocks(updatedBlocks)
    window.dispatchEvent(new CustomEvent('kubestellar-settings-changed'))
  }

  const storageKey = collapsedStorageKey || `kubestellar-${dashboardType}-stats-collapsed`
  const [isExpanded, setIsExpanded] = useState(() => {
    const savedCollapsed = safeGetJSON<boolean>(storageKey)
    return savedCollapsed === null || savedCollapsed === undefined ? defaultExpanded : !savedCollapsed
  })

  const toggleExpanded = () => {
    const newExpandedValue = !isExpanded
    setIsExpanded(newExpandedValue)
    safeSetJSON(storageKey, !newExpandedValue)
  }

  const gridCols = getStatsGridColumns(visibleBlocks.length)

  return (
    <div className={`mb-6 ${className}`}>
      <StatsOverviewHeader
        collapsible={collapsible}
        isExpanded={isExpanded}
        onToggleExpanded={toggleExpanded}
        resolvedTitle={resolvedTitle}
        isDemoData={isDemoData}
        showConfigButton={showConfigButton}
        onOpenConfig={openConfig}
        configureTitle={t('statsOverview.configureStats')}
        demoTooltip={t('statsOverview.demoTooltip', 'Showing sample data — connect clusters to see live metrics')}
        demoLabel={t('statsOverview.demo')}
      />

      {(!collapsible || isExpanded) && (
        <div className={`grid ${gridCols} gap-4`}>
          {visibleBlocks.map(block => {
            const statValue = effectiveIsLoading ? undefined : getStatValue(block.id)
            const data: StatBlockValue = effectiveIsLoading
              ? { value: '', sublabel: undefined }
              : (statValue ?? { value: '', sublabel: t('statsOverview.notAvailable') })

            return (
              <StatTile
                key={block.id}
                block={block}
                data={data}
                hasData={effectiveHasData && !effectiveIsLoading && statValue?.value !== undefined}
                isLoading={effectiveIsLoading}
                history={getHistory(block.id)}
                onDisplayModeChange={mode => handleDisplayModeChange(block.id, mode)}
              />
            )
          })}
        </div>
      )}

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
