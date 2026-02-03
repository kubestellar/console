import { useMemo, useCallback, useEffect, memo, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useClusters, useHelmReleases, useOperatorSubscriptions } from '../../hooks/useMCP'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { StatusIndicator } from '../charts/StatusIndicator'
import { useToast } from '../ui/Toast'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { RefreshCw, GitBranch, FolderGit, Box, Loader2, GripVertical } from 'lucide-react'
import { DashboardHeader } from '../shared/DashboardHeader'
import { SyncDialog } from './SyncDialog'
import { api } from '../../lib/api'
import { getDemoMode } from '../../hooks/useDemoMode'
import { CardWrapper } from '../cards/CardWrapper'
import { CARD_COMPONENTS, DEMO_DATA_CARDS } from '../cards/cardRegistry'
import { AddCardModal } from '../dashboard/AddCardModal'
import { TemplatesModal } from '../dashboard/TemplatesModal'
import { ConfigureCardModal } from '../dashboard/ConfigureCardModal'
import { FloatingDashboardActions } from '../dashboard/FloatingDashboardActions'
import type { DashboardTemplate } from '../dashboard/templates'
import { formatCardTitle } from '../../lib/formatCardTitle'
import { UnifiedStatsSection, GITOPS_STATS_CONFIG } from '../../lib/unified/stats'
import type { StatBlockValue } from '../ui/StatsOverview'
import { useDashboard, DashboardCard } from '../../lib/dashboards'
import { useState } from 'react'

// GitOps app configuration (repos to monitor)
interface GitOpsAppConfig {
  name: string
  namespace: string
  cluster: string
  repoUrl: string
  path: string
}

// GitOps app with detected status
interface GitOpsApp extends GitOpsAppConfig {
  syncStatus: 'synced' | 'out-of-sync' | 'unknown' | 'checking'
  healthStatus: 'healthy' | 'degraded' | 'progressing' | 'missing'
  lastSyncTime?: string
  driftDetails?: string[]
}

// Drift detection result from API
interface DriftResult {
  drifted: boolean
  resources: Array<{
    kind: string
    name: string
    namespace: string
    field: string
    gitValue: string
    clusterValue: string
  }>
  error?: string
}

// Width class lookup for Tailwind
const WIDTH_CLASSES: Record<number, string> = {
  3: 'col-span-3',
  4: 'col-span-4',
  5: 'col-span-5',
  6: 'col-span-6',
  7: 'col-span-7',
  8: 'col-span-8',
  9: 'col-span-9',
  10: 'col-span-10',
  11: 'col-span-11',
  12: 'col-span-12',
}

const GITOPS_STORAGE_KEY = 'kubestellar-gitops-dashboard-cards'

// Default cards for the GitOps dashboard
const DEFAULT_GITOPS_CARDS = [
  { type: 'argocd_applications', title: 'ArgoCD Applications', position: { w: 6, h: 4 } },
  { type: 'argocd_sync_status', title: 'ArgoCD Sync Status', position: { w: 6, h: 3 } },
  { type: 'helm_release_status', title: 'Helm Releases', position: { w: 6, h: 3 } },
  { type: 'kustomization_status', title: 'Kustomization Status', position: { w: 6, h: 3 } },
  { type: 'gitops_drift', title: 'GitOps Drift', position: { w: 6, h: 3 } },
]

// Sortable Card Component
interface SortableCardProps {
  card: DashboardCard
  onRemove: () => void
  onConfigure: () => void
  onWidthChange: (width: number) => void
  isDragging: boolean
  isRefreshing?: boolean
  onRefresh?: () => void
  lastUpdated?: Date | null
}

const SortableCard = memo(function SortableCard({
  card,
  onRemove,
  onConfigure,
  onWidthChange,
  isDragging,
  isRefreshing,
  onRefresh,
  lastUpdated,
}: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: card.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const CardComponent = CARD_COMPONENTS[card.card_type]
  if (!CardComponent) {
    console.warn(`Card component not found: ${card.card_type}`)
    return null
  }

  const width = Math.min(12, Math.max(3, card.position?.w || 6))
  const colSpan = WIDTH_CLASSES[width] || 'col-span-6'

  return (
    <div ref={setNodeRef} style={style} className={colSpan}>
      <CardWrapper
        title={formatCardTitle(card.card_type)}
        onRemove={onRemove}
        onConfigure={onConfigure}
        cardType={card.card_type}
        cardWidth={width}
        onWidthChange={onWidthChange}
        isDemoData={DEMO_DATA_CARDS.has(card.card_type)}
        isRefreshing={isRefreshing}
        onRefresh={onRefresh}
        lastUpdated={lastUpdated}
        dragHandle={
          <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
        }
      >
        <CardComponent config={card.config} />
      </CardWrapper>
    </div>
  )
})

// Drag preview component
function DragPreviewCard({ card }: { card: DashboardCard }) {
  const CardComponent = CARD_COMPONENTS[card.card_type]
  if (!CardComponent) return null

  const width = Math.min(12, Math.max(3, card.position?.w || 6))
  const colSpan = WIDTH_CLASSES[width] || 'col-span-6'

  return (
    <div className={colSpan}>
      <CardWrapper
        title={formatCardTitle(card.card_type)}
        cardType={card.card_type}
      >
        <CardComponent config={card.config} />
      </CardWrapper>
    </div>
  )
}

// Apps to monitor - these could come from a config file or API
function getGitOpsAppConfigs(): GitOpsAppConfig[] {
  return [
    {
      name: 'gatekeeper',
      namespace: 'gatekeeper-system',
      cluster: '',
      repoUrl: 'https://github.com/open-policy-agent/gatekeeper',
      path: 'deploy/',
    },
    {
      name: 'kuberay-operator',
      namespace: 'ray-system',
      cluster: '',
      repoUrl: 'https://github.com/ray-project/kuberay',
      path: 'ray-operator/config/default/',
    },
    {
      name: 'kserve',
      namespace: 'kserve',
      cluster: '',
      repoUrl: 'https://github.com/kserve/kserve',
      path: 'config/default/',
    },
    {
      name: 'gpu-operator',
      namespace: 'gpu-operator',
      cluster: '',
      repoUrl: 'https://github.com/NVIDIA/gpu-operator',
      path: 'deployments/gpu-operator/',
    },
  ]
}

function getTimeAgo(timestamp: string | undefined): string {
  if (!timestamp) return 'Unknown'
  const now = new Date()
  const then = new Date(timestamp)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)

  if (diffHours > 0) return `${diffHours}h ago`
  if (diffMins > 0) return `${diffMins}m ago`
  return 'Just now'
}

export function GitOps() {
  const { clusters, isRefreshing: dataRefreshing, refetch } = useClusters()
  const { releases: helmReleases } = useHelmReleases()
  const { subscriptions: operatorSubs } = useOperatorSubscriptions()
  const { drillToHelm: _drillToHelm, drillToOperator: _drillToOperator, drillToAllHelm, drillToAllOperators } = useDrillDownActions()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()
  const { showToast } = useToast()
  const [selectedCluster, setSelectedCluster] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [syncedApps, setSyncedApps] = useState<Set<string>>(new Set())
  const [syncDialogApp, setSyncDialogApp] = useState<GitOpsApp | null>(null)
  const [driftResults, setDriftResults] = useState<Map<string, DriftResult>>(new Map())
  const [isDetecting, setIsDetecting] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>(undefined)

  // Use the shared dashboard hook for cards, DnD, modals, auto-refresh
  const {
    cards,
    setCards,
    addCards,
    removeCard,
    configureCard,
    updateCardWidth,
    reset,
    isCustomized,
    showAddCard,
    setShowAddCard,
    showTemplates,
    setShowTemplates,
    configuringCard,
    setConfiguringCard,
    openConfigureCard,
    showCards,
    expandCards,
    dnd: { sensors, activeId, handleDragStart, handleDragEnd },
    autoRefresh,
    setAutoRefresh,
  } = useDashboard({
    storageKey: GITOPS_STORAGE_KEY,
    defaultCards: DEFAULT_GITOPS_CARDS,
    onRefresh: () => {
      refetch()
      setLastUpdated(new Date())
    },
  })

  const handleAddCards = useCallback((newCards: Array<{ type: string; title: string; config: Record<string, unknown> }>) => {
    addCards(newCards)
    expandCards()
    setShowAddCard(false)
  }, [addCards, expandCards, setShowAddCard])

  const handleRemoveCard = useCallback((cardId: string) => {
    removeCard(cardId)
  }, [removeCard])

  const handleConfigureCard = useCallback((cardId: string) => {
    openConfigureCard(cardId, cards)
  }, [openConfigureCard, cards])

  const handleSaveCardConfig = useCallback((cardId: string, config: Record<string, unknown>) => {
    configureCard(cardId, config)
    setConfiguringCard(null)
  }, [configureCard, setConfiguringCard])

  const handleWidthChange = useCallback((cardId: string, newWidth: number) => {
    updateCardWidth(cardId, newWidth)
  }, [updateCardWidth])

  const applyTemplate = useCallback((template: DashboardTemplate) => {
    const newCards = template.cards.map((card, i) => ({
      id: `card-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
      card_type: card.card_type,
      config: card.config || {},
      title: card.title,
    }))
    setCards(newCards)
    expandCards()
    setShowTemplates(false)
  }, [setCards, expandCards, setShowTemplates])

  // Set initial lastUpdated on mount
  useEffect(() => {
    setLastUpdated(new Date())
  }, [])

  const handleRefresh = useCallback(() => {
    refetch()
    setLastUpdated(new Date())
  }, [refetch])

  const { showIndicator, triggerRefresh } = useRefreshIndicator(handleRefresh)
  const isRefreshing = dataRefreshing || showIndicator
  const isFetching = isRefreshing || showIndicator

  // Detect drift for all apps on mount (skip in demo mode - no backend)
  useEffect(() => {
    if (getDemoMode()) return

    async function detectAllDrift() {
      setIsDetecting(true)
      const results = new Map<string, DriftResult>()
      const configs = getGitOpsAppConfigs()

      for (const appConfig of configs) {
        try {
          const response = await api.post<{
            drifted: boolean
            resources: DriftResult['resources']
            rawDiff?: string
          }>('/api/gitops/detect-drift', {
            repoUrl: appConfig.repoUrl,
            path: appConfig.path,
            namespace: appConfig.namespace,
            cluster: appConfig.cluster || undefined,
          })

          results.set(appConfig.name, {
            drifted: response.data.drifted,
            resources: response.data.resources || [],
          })
        } catch (err) {
          // On error, mark as unknown (not drifted)
          results.set(appConfig.name, {
            drifted: false,
            resources: [],
            error: 'Failed to detect drift',
          })
        }
      }

      setDriftResults(results)
      setIsDetecting(false)
    }

    detectAllDrift()
  }, [])

  // Handle sync action - open the sync dialog
  const handleSync = useCallback((app: GitOpsApp) => {
    setSyncDialogApp(app)
  }, [])

  // Handle sync complete - mark app as synced and refresh drift status
  const handleSyncComplete = useCallback(() => {
    if (syncDialogApp) {
      setSyncedApps(prev => new Set(prev).add(syncDialogApp.name))
      // Also update drift results to show synced
      setDriftResults(prev => {
        const updated = new Map(prev)
        updated.set(syncDialogApp.name, { drifted: false, resources: [] })
        return updated
      })
      showToast(`${syncDialogApp.name} synced successfully!`, 'success')
    }
  }, [syncDialogApp, showToast])

  // Build apps list with real drift status
  const apps = useMemo(() => {
    const configs = getGitOpsAppConfigs()
    return configs.map((config): GitOpsApp => {
      // If manually synced, show as synced
      if (syncedApps.has(config.name)) {
        return {
          ...config,
          syncStatus: 'synced',
          healthStatus: 'healthy',
          lastSyncTime: new Date().toISOString(),
          driftDetails: undefined,
        }
      }

      // If still detecting, show checking state
      if (isDetecting) {
        return {
          ...config,
          syncStatus: 'checking',
          healthStatus: 'progressing',
          lastSyncTime: undefined,
          driftDetails: undefined,
        }
      }

      // Use real drift detection results
      const drift = driftResults.get(config.name)
      if (drift) {
        const driftDetails = drift.resources.length > 0
          ? drift.resources.map(r => `${r.kind}/${r.name}: ${r.field || 'modified'}`)
          : drift.error
            ? [drift.error]
            : undefined

        return {
          ...config,
          syncStatus: drift.drifted ? 'out-of-sync' : 'synced',
          healthStatus: drift.drifted ? 'progressing' : 'healthy',
          lastSyncTime: new Date().toISOString(),
          driftDetails,
        }
      }

      // Default to unknown if no results
      return {
        ...config,
        syncStatus: 'unknown',
        healthStatus: 'missing',
        lastSyncTime: undefined,
        driftDetails: undefined,
      }
    })
  }, [driftResults, isDetecting, syncedApps])

  const filteredApps = useMemo(() => {
    const filtered = apps.map(app => {
      // If app was manually synced, update its status
      if (syncedApps.has(app.name)) {
        return {
          ...app,
          syncStatus: 'synced' as const,
          healthStatus: 'healthy' as const,
          driftDetails: undefined,
          lastSyncTime: new Date().toISOString(),
        }
      }
      return app
    }).filter(app => {
      // Only filter by cluster if one is selected
      if (selectedCluster && app.cluster !== selectedCluster) return false
      // Only filter by status if not 'all'
      if (statusFilter === 'synced' && app.syncStatus !== 'synced') return false
      if (statusFilter === 'drifted' && app.syncStatus !== 'out-of-sync') return false
      return true
    })
    return filtered
  }, [apps, selectedCluster, statusFilter, syncedApps])

  const stats = useMemo(() => ({
    total: apps.length,
    synced: apps.filter(a => a.syncStatus === 'synced').length,
    drifted: apps.filter(a => a.syncStatus === 'out-of-sync').length,
    healthy: apps.filter(a => a.healthStatus === 'healthy').length,
    checking: apps.filter(a => a.syncStatus === 'checking').length,
  }), [apps])

  // Cache helm releases count to prevent showing 0 during refresh
  const cachedHelmCount = useRef(0)
  useEffect(() => {
    if (helmReleases.length > 0) {
      cachedHelmCount.current = helmReleases.length
    }
  }, [helmReleases.length])
  const helmCount = helmReleases.length > 0 ? helmReleases.length : cachedHelmCount.current

  const syncStatusColor = (status: string) => {
    switch (status) {
      case 'synced': return 'text-green-400 bg-green-500/20'
      case 'out-of-sync': return 'text-yellow-400 bg-yellow-500/20'
      case 'checking': return 'text-blue-400 bg-blue-500/20'
      default: return 'text-muted-foreground bg-card'
    }
  }

  const syncStatusLabel = (status: string) => {
    switch (status) {
      case 'synced': return 'Synced'
      case 'out-of-sync': return 'Out of Sync'
      case 'checking': return 'Checking...'
      default: return 'Unknown'
    }
  }

  const healthStatusIndicator = (status: string): 'healthy' | 'warning' | 'error' => {
    switch (status) {
      case 'healthy': return 'healthy'
      case 'progressing': return 'warning'
      default: return 'error'
    }
  }

  // Stats value getter for the configurable StatsOverview component
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'total':
        return { value: stats.total, sublabel: 'apps configured', onClick: () => drillToAllHelm(), isClickable: stats.total > 0 }
      case 'helm':
        return { value: helmCount, sublabel: 'helm releases', onClick: () => drillToAllHelm(), isClickable: helmCount > 0 }
      case 'kustomize':
        return { value: 0, sublabel: 'kustomize apps', isClickable: false }
      case 'operators':
        return { value: operatorSubs.length, sublabel: 'operators', onClick: () => drillToAllOperators(), isClickable: operatorSubs.length > 0 }
      case 'deployed':
        return { value: stats.synced, sublabel: 'synced', onClick: () => drillToAllHelm('synced'), isClickable: stats.synced > 0 }
      case 'failed':
        return { value: stats.drifted, sublabel: 'drifted', onClick: () => drillToAllHelm('drifted'), isClickable: stats.drifted > 0 }
      case 'pending':
        return { value: stats.checking, sublabel: 'checking', isClickable: false }
      case 'other':
        return { value: stats.healthy, sublabel: 'healthy', onClick: () => drillToAllHelm('healthy'), isClickable: stats.healthy > 0 }
      default:
        return { value: 0 }
    }
  }, [stats, helmCount, operatorSubs, drillToAllHelm, drillToAllOperators])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  // Transform card for ConfigureCardModal
  const configureCardData = configuringCard ? {
    id: configuringCard.id,
    card_type: configuringCard.card_type,
    config: configuringCard.config,
    title: configuringCard.title,
  } : null

  return (
    <div className="">
      {/* Header */}
      <DashboardHeader
        title="GitOps"
        subtitle="GitOps drift detection and sync status"
        icon={<GitBranch className="w-6 h-6 text-purple-400" />}
        isFetching={isFetching}
        onRefresh={triggerRefresh}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="gitops-auto-refresh"
        lastUpdated={lastUpdated}
      />

      {/* Configurable Stats Overview */}
      <UnifiedStatsSection
        config={GITOPS_STATS_CONFIG}
        getStatValue={getStatValue}
        hasData={stats.total > 0}
        isLoading={false}
        lastUpdated={lastUpdated}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <select
          value={selectedCluster}
          onChange={(e) => setSelectedCluster(e.target.value)}
          className="px-4 py-2 rounded-lg bg-card/50 border border-border text-foreground text-sm"
        >
          <option value="">All Clusters</option>
          {clusters.map((cluster) => (
            <option key={cluster.name} value={cluster.context || cluster.name.split('/').pop()}>
              {cluster.context || cluster.name.split('/').pop()}
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setStatusFilter('synced')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'synced'
                ? 'bg-green-500 text-white'
                : 'bg-card/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            Synced
          </button>
          <button
            onClick={() => setStatusFilter('drifted')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'drifted'
                ? 'bg-yellow-500 text-white'
                : 'bg-card/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            Drifted
          </button>
        </div>
      </div>

      {/* Apps List */}
      {filteredApps.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🔄</div>
          <p className="text-lg text-foreground">No GitOps applications found</p>
          <p className="text-sm text-muted-foreground">Configure ArgoCD or Flux to see sync status</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredApps.map((app, i) => (
            <div
              key={i}
              className={`glass p-4 rounded-lg border-l-4 ${
                app.syncStatus === 'synced' ? 'border-l-green-500' :
                app.syncStatus === 'checking' ? 'border-l-blue-500' :
                app.syncStatus === 'out-of-sync' ? 'border-l-yellow-500' :
                'border-l-gray-500'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <StatusIndicator status={healthStatusIndicator(app.healthStatus)} size="lg" />
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-foreground">{app.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${syncStatusColor(app.syncStatus)}`}>
                        {app.syncStatus === 'checking' && <Loader2 className="w-3 h-3 animate-spin" />}
                        {syncStatusLabel(app.syncStatus)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1" title="Kubernetes Namespace">
                        <Box className="w-3 h-3" />
                        <span>{app.namespace}</span>
                      </span>
                      {app.cluster && (
                        <span className="flex items-center gap-1" title="Target Cluster">
                          <span className="text-muted-foreground/50">→</span>
                          <span>{app.cluster}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1" title="Git Repository Source">
                      <GitBranch className="w-3 h-3 text-purple-400" />
                      <span className="font-mono">github.com/{app.repoUrl.replace('https://github.com/', '')}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground" title="Path in Repository">
                      <FolderGit className="w-3 h-3 text-blue-400" />
                      <span className="font-mono">{app.path}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>Last sync: {getTimeAgo(app.lastSyncTime)}</div>
                  <div className="mt-1 capitalize">{app.healthStatus}</div>
                </div>
              </div>

              {/* Drift Details */}
              {app.driftDetails && app.driftDetails.length > 0 && (
                <div className="mt-3 p-3 rounded bg-yellow-500/10 border border-yellow-500/20">
                  <div className="text-sm font-medium text-yellow-400 mb-2">Drift Detected</div>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {app.driftDetails.map((detail, j) => (
                      <li key={j} className="flex items-center gap-2">
                        <span className="text-yellow-400">•</span>
                        {detail}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => handleSync(app)}
                    className="mt-2 px-3 py-1 rounded bg-yellow-500/20 text-yellow-400 text-xs hover:bg-yellow-500/30 transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Sync Now
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Cards Grid */}
      {showCards && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={cards.map(c => c.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pb-32">
              {cards.map(card => (
                <SortableCard
                  key={card.id}
                  card={card}
                  onRemove={() => handleRemoveCard(card.id)}
                  onConfigure={() => handleConfigureCard(card.id)}
                  onWidthChange={(width) => handleWidthChange(card.id, width)}
                  isDragging={activeId === card.id}
                  isRefreshing={isRefreshing}
                  onRefresh={triggerRefresh}
                  lastUpdated={lastUpdated}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeId ? (
              <div className="opacity-80 rotate-3 scale-105">
                <DragPreviewCard card={cards.find(c => c.id === activeId)!} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Info */}
      <div className="mt-8 p-4 rounded-lg bg-card/30 border border-border">
        <h3 className="text-lg font-semibold text-foreground mb-3">GitOps Integration</h3>
        <p className="text-sm text-muted-foreground mb-3">
          GitOps integration detects drift between your Git repository and live cluster state
          using kubectl diff. Connect ArgoCD or Flux for enhanced sync capabilities.
        </p>
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded-lg bg-card/50 border border-border text-sm text-foreground hover:bg-card transition-colors">
            Configure ArgoCD
          </button>
          <button className="px-4 py-2 rounded-lg bg-card/50 border border-border text-sm text-foreground hover:bg-card transition-colors">
            Configure Flux
          </button>
        </div>
      </div>

      {/* Floating Actions */}
      <FloatingDashboardActions
        onAddCard={() => setShowAddCard(true)}
        onOpenTemplates={() => setShowTemplates(true)}
        onResetToDefaults={reset}
        isCustomized={isCustomized}
      />

      {/* Add Card Modal */}
      <AddCardModal
        isOpen={showAddCard}
        onClose={() => setShowAddCard(false)}
        onAddCards={handleAddCards}
        existingCardTypes={cards.map(c => c.card_type)}
      />

      {/* Templates Modal */}
      <TemplatesModal
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        onApplyTemplate={applyTemplate}
      />

      {/* Configure Card Modal */}
      <ConfigureCardModal
        isOpen={!!configuringCard}
        card={configureCardData}
        onClose={() => setConfiguringCard(null)}
        onSave={handleSaveCardConfig}
      />

      {/* Sync Dialog */}
      {syncDialogApp && (
        <SyncDialog
          isOpen={!!syncDialogApp}
          onClose={() => setSyncDialogApp(null)}
          appName={syncDialogApp.name}
          namespace={syncDialogApp.namespace}
          cluster={syncDialogApp.cluster}
          repoUrl={syncDialogApp.repoUrl}
          path={syncDialogApp.path}
          onSyncComplete={handleSyncComplete}
        />
      )}
    </div>
  )
}
