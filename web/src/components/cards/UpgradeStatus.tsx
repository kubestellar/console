import { useMemo, useRef, useState } from 'react'
import { ArrowUp, Rocket } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useMissions } from '../../hooks/useMissions'
import { ConfirmMissionPromptDialog } from '../missions/ConfirmMissionPromptDialog'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useCardData } from '../../lib/cards/cardHooks'
import { CardSearchInput, CardControlsRow, CardPaginationFooter, CardAIActions } from '../../lib/cards/CardComponents'
import { StatusBadge } from '../ui/StatusBadge'
import { Button } from '../ui/Button'
import { useCardLoadingState } from './CardDataContext'
import { useDrillDownWebSocket } from '../../hooks/useDrillDownWebSocket'
import { useTranslation } from 'react-i18next'
import { useUpgradeStateMachine } from '../../hooks/useUpgradeStateMachine'
import { getCachedVersion, getStaleCachedVersion } from '../../hooks/useUpgradeWebSocket'
import {
  buildUpgradePrompt,
  deriveLatestMinor,
  getRecommendedUpgrade,
  getStatusIcon,
  SORT_OPTIONS,
  UPGRADE_SORT_COMPARATORS,
  type UpgradeItem,
  type SortByOption,
} from './upgradeHelpers'

interface UpgradeStatusProps {
  config?: Record<string, unknown>
}

interface PendingUpgrade {
  clusterName: string
  currentVersion: string
  targetVersion: string
  prompt: string
}

export function UpgradeStatus({ config: _config }: UpgradeStatusProps) {
  const { t } = useTranslation()
  const {
    deduplicatedClusters: allClusters,
    isLoading: isLoadingHook,
    isRefreshing,
    isFailed,
    consecutiveFailures,
  } = useClusters()
  const { drillToCluster } = useDrillDownActions()
  const { startMission } = useMissions()
  const { isConnected: agentConnected } = useLocalAgent()
  const { isDemoMode } = useDemoMode()
  const defaultCluster = allClusters[0]?.name || ''
  const { openTrackedWs, parseWsMessage } = useDrillDownWebSocket(defaultCluster)
  const { clusterVersions, fetchCompleted } = useUpgradeStateMachine({
    allClusters,
    agentConnected,
    isDemoMode,
    openTrackedWs,
    parseWsMessage,
  })
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
  } = useGlobalFilters()

  // Only show skeleton when no cached data exists - prevents flickering on refresh
  const isLoading = isLoadingHook && allClusters.length === 0

  // Report state to CardWrapper for refresh animation
  const hasData = allClusters.length > 0
  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData: isDemoMode && !isLoadingHook,
    isFailed,
    consecutiveFailures,
  })

  // #6309: show the prompt-confirmation dialog before starting the
  // upgrade mission. Previously, clicking "Start Upgrade" launched
  // the AI agent immediately with no chance for the user to review
  // or edit the prompt — a critical-function click with no gate.
  // The ConfirmMissionPromptDialog was added in #5913 for exactly
  // this pattern (installer flows); here we reuse it for upgrades.
  const [pendingUpgrade, setPendingUpgrade] = useState<PendingUpgrade | null>(null)
  // #6320: guards against double-clicking the Confirm button in the
  // dialog. `setPendingUpgrade(null)` is async, so a second click that
  // fires before React re-renders would still see `pendingUpgrade`
  // non-null, pass the !pendingUpgrade guard, and call startMission
  // again. A ref flipped synchronously at the top of the handler
  // closes that window.
  const startingMissionRef = useRef(false)

  const handleStartUpgrade = (clusterName: string, currentVersion: string, targetVersion: string) => {
    // Stage the upgrade in pending state — the dialog below will call
    // confirmStartUpgrade (with the possibly-edited prompt) or cancel.
    setPendingUpgrade({
      clusterName,
      currentVersion,
      targetVersion,
      prompt: buildUpgradePrompt(clusterName, currentVersion, targetVersion),
    })
  }

  const confirmStartUpgrade = (editedPrompt: string) => {
    // #6320: double-click guard. The two checks work together:
    //   - startingMissionRef: synchronous; catches back-to-back clicks
    //     inside a single React commit cycle.
    //   - !pendingUpgrade: catches stale-closure invocations after
    //     the dialog has been dismissed but a queued click is still
    //     pending.
    if (!pendingUpgrade || startingMissionRef.current) return
    startingMissionRef.current = true

    const { clusterName, currentVersion, targetVersion } = pendingUpgrade
    startMission({
      title: `Upgrade ${clusterName}`,
      description: `Upgrade from ${currentVersion} to ${targetVersion}`,
      type: 'upgrade',
      cluster: clusterName,
      initialPrompt: editedPrompt,
      context: {
        clusterName,
        currentVersion,
        targetVersion,
      },
    })
    setPendingUpgrade(null)

    // Reset the ref on the next tick so a subsequent (new) upgrade
    // mission can run normally.
    setTimeout(() => {
      startingMissionRef.current = false
    }, 0)
  }

  const globalFilteredClusters = (() => {
    let result = allClusters

    if (!isAllClustersSelected) {
      result = (result || []).filter((cluster) => globalSelectedClusters.includes(cluster.name))
    }

    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = (result || []).filter(
        (cluster) =>
          cluster.name.toLowerCase().includes(query) ||
          cluster.context?.toLowerCase().includes(query),
      )
    }

    return result
  })()

  // Derive the latest Kubernetes minor version dynamically from observed cluster versions
  const latestMinor = deriveLatestMinor(clusterVersions)

  // Build version data from real cluster versions
  const clusterVersionData = useMemo(() => {
    return (globalFilteredClusters || []).map((cluster) => {
      // A cluster is reachable if it has nodes (same logic as other components)
      const hasNodes = cluster.nodeCount && cluster.nodeCount > 0
      const isUnreachable = cluster.reachable === false || (!hasNodes && cluster.healthy === false)
      const isStillLoading = !hasNodes && cluster.nodeCount === undefined && cluster.reachable === undefined

      // Try state first, then fresh cache, then stale cache (survives page refresh), then fallback
      const stateVersion = clusterVersions[cluster.name]
      const freshCached = getCachedVersion(cluster.name)
      const staleCached = getStaleCachedVersion(cluster.name)
      const currentVersion = stateVersion || freshCached || staleCached ||
        (isUnreachable ? '-' : (isStillLoading || (!fetchCompleted && agentConnected) ? 'loading...' : '-'))

      const targetVersion = getRecommendedUpgrade(currentVersion, latestMinor)
      const hasUpgrade = Boolean(
        targetVersion &&
        targetVersion !== currentVersion &&
        currentVersion !== '-' &&
        currentVersion !== 'loading...'
      )

      return {
        name: cluster.name,
        currentVersion,
        targetVersion: hasUpgrade ? targetVersion ?? currentVersion : currentVersion,
        status: isUnreachable
          ? 'unreachable' as const
          : isStillLoading
            ? 'loading' as const
            : hasUpgrade
              ? 'available' as const
              : 'current' as const,
        progress: 0,
        isUnreachable,
        isLoading: isStillLoading,
      }
    })
  }, [globalFilteredClusters, clusterVersions, agentConnected, fetchCompleted, latestMinor])

  const {
    items: displayClusters,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search,
      setSearch,
      localClusterFilter,
      toggleClusterFilter,
      clearClusterFilter,
      availableClusters,
      showClusterFilter,
      setShowClusterFilter,
      clusterFilterRef,
    },
    sorting: { sortBy, setSortBy, sortDirection, setSortDirection },
    containerRef,
    containerStyle,
  } = useCardData<UpgradeItem, SortByOption>(clusterVersionData, {
    filter: {
      searchFields: ['name', 'currentVersion'],
      clusterField: 'name',
      storageKey: 'upgrade-status',
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: UPGRADE_SORT_COMPARATORS,
    },
    defaultLimit: 5,
  })

  // Suppress unused variable warnings for values used indirectly
  void totalItems

  const pendingUpgrades = (clusterVersionData || []).filter((cluster) => cluster.status === 'available').length

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="spinner w-8 h-8" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
        <div className="flex items-center gap-2">
          {pendingUpgrades > 0 && (
            <StatusBadge color="yellow">
              {pendingUpgrades} upgrades available
            </StatusBadge>
          )}
        </div>
        <CardControlsRow
          clusterIndicator={
            localClusterFilter.length > 0
              ? { selectedCount: localClusterFilter.length, totalCount: availableClusters.length }
              : undefined
          }
          clusterFilter={{
            availableClusters,
            selectedClusters: localClusterFilter,
            onToggle: toggleClusterFilter,
            onClear: clearClusterFilter,
            isOpen: showClusterFilter,
            setIsOpen: setShowClusterFilter,
            containerRef: clusterFilterRef,
            minClusters: 1,
          }}
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: (value) => setSortBy(value as SortByOption),
            sortDirection,
            onSortDirectionChange: setSortDirection,
          }}
          className="mb-0"
        />
      </div>

      <CardSearchInput
        value={search}
        onChange={setSearch}
        placeholder={t('common.searchClusters')}
        className="mb-3"
      />

      <div ref={containerRef} className="flex-1 space-y-2 overflow-y-auto" style={containerStyle}>
        {(displayClusters || []).map((cluster) => (
          <div
            key={cluster.name}
            className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
          >
            <div
              className="cursor-pointer"
              onClick={() => drillToCluster(cluster.name, {
                tab: 'upgrade',
                version: cluster.currentVersion,
                targetVersion: cluster.targetVersion,
              })}
            >
              <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2 gap-2">
                <span className="text-sm font-medium text-foreground truncate min-w-0 flex-1">{cluster.name}</span>
                <span className="shrink-0">{getStatusIcon(cluster.status)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{cluster.currentVersion}</span>
                {cluster.targetVersion && cluster.targetVersion !== cluster.currentVersion && (
                  <>
                    <ArrowUp className="w-3 h-3" />
                    <span className="font-mono text-green-400">{cluster.targetVersion}</span>
                  </>
                )}
              </div>
            </div>
            {cluster.status === 'available' && (
              <Button
                variant="accent"
                size="sm"
                fullWidth
                icon={<Rocket className="w-3 h-3" />}
                onClick={(event) => {
                  event.stopPropagation()
                  handleStartUpgrade(cluster.name, cluster.currentVersion, cluster.targetVersion)
                }}
                aria-label={`Start upgrade of ${cluster.name} to ${cluster.targetVersion}`}
              >
                Start Upgrade to {cluster.targetVersion}
              </Button>
            )}
            {(cluster.status === 'unreachable' || cluster.status === 'available') && (
              <CardAIActions
                resource={{ kind: 'Cluster', name: cluster.name, status: cluster.status }}
                issues={[{
                  name: cluster.status === 'unreachable' ? 'Cluster unreachable' : 'Upgrade available',
                  message: cluster.status === 'unreachable'
                    ? `Cluster ${cluster.name} is unreachable and cannot be queried for version info`
                    : `Cluster ${cluster.name} can be upgraded from ${cluster.currentVersion} to ${cluster.targetVersion}`,
                }]}
                className="mt-2"
              />
            )}
          </div>
        ))}
      </div>

      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 10}
        onPageChange={goToPage}
        needsPagination={needsPagination}
      />

      {/* #6309: confirm prompt before running the upgrade mission. */}
      {pendingUpgrade && (
        <ConfirmMissionPromptDialog
          open={true}
          missionTitle={`Upgrade ${pendingUpgrade.clusterName}`}
          missionDescription={`Upgrade from ${pendingUpgrade.currentVersion} to ${pendingUpgrade.targetVersion}`}
          initialPrompt={pendingUpgrade.prompt}
          onCancel={() => setPendingUpgrade(null)}
          onConfirm={confirmStartUpgrade}
        />
      )}
    </div>
  )
}
