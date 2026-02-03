import { useEffect, useCallback, memo } from 'react'
import { useLocation } from 'react-router-dom'
import { Shield, GripVertical, AlertCircle } from 'lucide-react'
import { DashboardHeader } from '../shared/DashboardHeader'
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
import { useClusters } from '../../hooks/useMCP'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { CardWrapper } from '../cards/CardWrapper'
import { CARD_COMPONENTS, DEMO_DATA_CARDS } from '../cards/cardRegistry'
import { AddCardModal } from '../dashboard/AddCardModal'
import { TemplatesModal } from '../dashboard/TemplatesModal'
import { ConfigureCardModal } from '../dashboard/ConfigureCardModal'
import { FloatingDashboardActions } from '../dashboard/FloatingDashboardActions'
import { DashboardTemplate } from '../dashboard/templates'
import { formatCardTitle } from '../../lib/formatCardTitle'
import { UnifiedStatsSection, COMPLIANCE_STATS_CONFIG } from '../../lib/unified/stats'
import type { StatBlockValue } from '../ui/StatsOverview'
import { useDashboard, DashboardCard } from '../../lib/dashboards'

// Width class lookup for Tailwind (dynamic classes don't work)
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

const COMPLIANCE_CARDS_KEY = 'compliance-dashboard-cards'

// Default cards for the Compliance dashboard
const DEFAULT_COMPLIANCE_CARDS = [
  { type: 'opa_policies', title: 'OPA Gatekeeper', position: { w: 4, h: 3 } },
  { type: 'kyverno_policies', title: 'Kyverno Policies', position: { w: 4, h: 3 } },
  { type: 'security_issues', title: 'Security Issues', position: { w: 8, h: 4 } },
  { type: 'namespace_rbac', title: 'Namespace RBAC', position: { w: 6, h: 4 } },
]

// Mock compliance posture data
function getCompliancePosture(clusterCount: number) {
  const totalChecks = clusterCount * 45
  const passing = Math.floor(totalChecks * 0.78)
  const failing = Math.floor(totalChecks * 0.12)
  const warning = totalChecks - passing - failing

  return {
    totalChecks,
    passing,
    failing,
    warning,
    score: Math.round((passing / totalChecks) * 100),
    criticalFindings: Math.floor(clusterCount * 2.3),
    highFindings: Math.floor(clusterCount * 5.1),
    mediumFindings: Math.floor(clusterCount * 8.7),
    lowFindings: Math.floor(clusterCount * 12.4),
    // Tool-specific metrics
    gatekeeperViolations: Math.floor(clusterCount * 3.2),
    kyvernoViolations: Math.floor(clusterCount * 2.8),
    kubescapeScore: 78 + Math.floor(Math.random() * 10),
    falcoAlerts: Math.floor(clusterCount * 1.5),
    trivyVulns: Math.floor(clusterCount * 12),
    criticalCVEs: Math.floor(clusterCount * 1.8),
    highCVEs: Math.floor(clusterCount * 4.2),
    cisScore: 82 + Math.floor(Math.random() * 8),
    nsaScore: 76 + Math.floor(Math.random() * 12),
    pciScore: 71 + Math.floor(Math.random() * 15),
  }
}

export function Compliance() {
  const location = useLocation()
  const { clusters, isLoading, refetch, lastUpdated, isRefreshing: dataRefreshing, error } = useClusters()
  const { showIndicator, triggerRefresh } = useRefreshIndicator(refetch)
  const isRefreshing = dataRefreshing || showIndicator
  const isFetching = isLoading || isRefreshing || showIndicator
  const { drillToPolicy: _drillToPolicy, drillToAllSecurity } = useDrillDownActions()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()

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
    storageKey: COMPLIANCE_CARDS_KEY,
    defaultCards: DEFAULT_COMPLIANCE_CARDS,
    onRefresh: refetch,
  })

  // Trigger refresh when navigating to this page
  useEffect(() => {
    refetch()
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Filter clusters based on global selection
  const filteredClusters = clusters.filter(c =>
    isAllClustersSelected || globalSelectedClusters.includes(c.name)
  )
  const reachableClusters = filteredClusters.filter(c => c.reachable !== false)

  // Calculate compliance posture
  const posture = getCompliancePosture(reachableClusters.length || 1)

  // Stats value getter for the configurable StatsOverview component
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      // Overall compliance
      case 'score':
        return { value: `${posture.score}%`, sublabel: 'compliance score', onClick: () => drillToAllSecurity(), isClickable: reachableClusters.length > 0 }
      case 'total_checks':
        return { value: posture.totalChecks, sublabel: 'total checks', onClick: () => drillToAllSecurity(), isClickable: posture.totalChecks > 0 }
      case 'passing':
        return { value: posture.passing, sublabel: 'passing', onClick: () => drillToAllSecurity('passing'), isClickable: posture.passing > 0 }
      case 'failing':
        return { value: posture.failing, sublabel: 'failing', onClick: () => drillToAllSecurity('failing'), isClickable: posture.failing > 0 }
      case 'warning':
        return { value: posture.warning, sublabel: 'warnings', onClick: () => drillToAllSecurity('warning'), isClickable: posture.warning > 0 }
      case 'critical_findings':
        return { value: posture.criticalFindings, sublabel: 'critical findings', onClick: () => drillToAllSecurity('critical'), isClickable: posture.criticalFindings > 0 }

      // Policy enforcement tools
      case 'gatekeeper_violations':
        return { value: posture.gatekeeperViolations, sublabel: 'Gatekeeper violations', isClickable: false }
      case 'kyverno_violations':
        return { value: posture.kyvernoViolations, sublabel: 'Kyverno violations', isClickable: false }
      case 'kubescape_score':
        return { value: `${posture.kubescapeScore}%`, sublabel: 'Kubescape score', isClickable: false }

      // Security scanning
      case 'falco_alerts':
        return { value: posture.falcoAlerts, sublabel: 'Falco alerts', isClickable: false }
      case 'trivy_vulns':
        return { value: posture.trivyVulns, sublabel: 'Trivy vulnerabilities', isClickable: false }
      case 'critical_vulns':
        return { value: posture.criticalCVEs, sublabel: 'critical CVEs', isClickable: false }
      case 'high_vulns':
        return { value: posture.highCVEs, sublabel: 'high CVEs', isClickable: false }

      // Framework compliance
      case 'cis_score':
        return { value: `${posture.cisScore}%`, sublabel: 'CIS benchmark', isClickable: false }
      case 'nsa_score':
        return { value: `${posture.nsaScore}%`, sublabel: 'NSA hardening', isClickable: false }
      case 'pci_score':
        return { value: `${posture.pciScore}%`, sublabel: 'PCI-DSS', isClickable: false }

      default:
        return { value: '-' }
    }
  }, [posture, reachableClusters, drillToAllSecurity])

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
        title="Security Posture"
        subtitle="Security scanning, vulnerability assessment, and policy enforcement"
        icon={<Shield className="w-6 h-6 text-purple-400" />}
        isFetching={isFetching}
        onRefresh={triggerRefresh}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="compliance-auto-refresh"
        lastUpdated={lastUpdated}
      />

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-400">Error loading compliance data</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Configurable Stats Overview */}
      <UnifiedStatsSection
        config={COMPLIANCE_STATS_CONFIG}
        getStatValue={getStatValue}
        hasData={posture.totalChecks > 0}
        isLoading={isLoading && clusters.length === 0}
        lastUpdated={lastUpdated}
      />

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
    </div>
  )
}
