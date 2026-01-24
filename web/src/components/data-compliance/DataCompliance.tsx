import { useEffect, useCallback, memo } from 'react'
import { useLocation } from 'react-router-dom'
import { Database, RefreshCw, Hourglass, GripVertical, FlaskConical } from 'lucide-react'
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
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { CardWrapper } from '../cards/CardWrapper'
import { CARD_COMPONENTS, DEMO_DATA_CARDS } from '../cards/cardRegistry'
import { AddCardModal } from '../dashboard/AddCardModal'
import { TemplatesModal } from '../dashboard/TemplatesModal'
import { ConfigureCardModal } from '../dashboard/ConfigureCardModal'
import { FloatingDashboardActions } from '../dashboard/FloatingDashboardActions'
import { DashboardTemplate } from '../dashboard/templates'
import { formatCardTitle } from '../../lib/formatCardTitle'
import { StatsOverview, StatBlockValue } from '../ui/StatsOverview'
import { useDashboard, DashboardCard } from '../../lib/dashboards'

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

// Sortable Card Component
interface SortableCardProps {
  card: DashboardCard
  onRemove: () => void
  onConfigure: () => void
  onWidthChange: (width: number) => void
  isDragging: boolean
}

const SortableCard = memo(function SortableCard({
  card,
  onRemove,
  onConfigure,
  onWidthChange,
  isDragging,
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

const DATA_COMPLIANCE_CARDS_KEY = 'data-compliance-dashboard-cards'

// Default cards for Data Compliance dashboard
const DEFAULT_DATA_COMPLIANCE_CARDS = [
  { type: 'vault_secrets', title: 'HashiCorp Vault', position: { w: 4, h: 3 } },
  { type: 'external_secrets', title: 'External Secrets', position: { w: 4, h: 3 } },
  { type: 'cert_manager', title: 'Cert-Manager', position: { w: 4, h: 3 } },
  { type: 'namespace_rbac', title: 'Access Controls', position: { w: 6, h: 4 } },
]

// Fixed demo data for data compliance posture
const DEMO_POSTURE = {
  // Encryption
  encryptedSecrets: 156,
  unencryptedSecrets: 8,
  encryptionScore: 94,
  // Data residency
  regionsCompliant: 4,
  regionsTotal: 5,
  // Access control
  rbacPolicies: 48,
  excessivePermissions: 6,
  // PII detection
  piiDetected: 12,
  piiProtected: 9,
  // Audit
  auditEnabled: 85,
  retentionDays: 90,
  // Framework scores
  gdprScore: 86,
  hipaaScore: 82,
  pciScore: 88,
  soc2Score: 84,
}

export function DataCompliance() {
  const location = useLocation()
  const { isLoading, refetch, lastUpdated, isRefreshing } = useClusters()
  useGlobalFilters() // Keep hook for potential future use

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
    storageKey: DATA_COMPLIANCE_CARDS_KEY,
    defaultCards: DEFAULT_DATA_COMPLIANCE_CARDS,
    onRefresh: refetch,
  })

  useEffect(() => {
    refetch()
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = useCallback(() => {
    refetch()
  }, [refetch])

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

  // Use fixed demo posture data
  const posture = DEMO_POSTURE

  // Stats value getter - returns fixed demo data with isDemo flag
  const getStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      // Encryption
      case 'encryption_score':
        return { value: `${posture.encryptionScore}%`, sublabel: 'encryption coverage', isClickable: false, isDemo: true }
      case 'encrypted_secrets':
        return { value: posture.encryptedSecrets, sublabel: 'encrypted secrets', isClickable: false, isDemo: true }
      case 'unencrypted_secrets':
        return { value: posture.unencryptedSecrets, sublabel: 'unencrypted', isClickable: false, isDemo: true }

      // Data residency
      case 'regions_compliant':
        return { value: `${posture.regionsCompliant}/${posture.regionsTotal}`, sublabel: 'regions compliant', isClickable: false, isDemo: true }

      // Access control
      case 'rbac_policies':
        return { value: posture.rbacPolicies, sublabel: 'RBAC policies', isClickable: false, isDemo: true }
      case 'excessive_permissions':
        return { value: posture.excessivePermissions, sublabel: 'excessive permissions', isClickable: false, isDemo: true }

      // PII
      case 'pii_detected':
        return { value: posture.piiDetected, sublabel: 'PII instances', isClickable: false, isDemo: true }
      case 'pii_protected':
        return { value: posture.piiProtected, sublabel: 'protected', isClickable: false, isDemo: true }

      // Audit
      case 'audit_enabled':
        return { value: `${posture.auditEnabled}%`, sublabel: 'audit enabled', isClickable: false, isDemo: true }
      case 'retention_days':
        return { value: posture.retentionDays, sublabel: 'day retention', isClickable: false, isDemo: true }

      // Framework scores
      case 'gdpr_score':
        return { value: `${posture.gdprScore}%`, sublabel: 'GDPR', isClickable: false, isDemo: true }
      case 'hipaa_score':
        return { value: `${posture.hipaaScore}%`, sublabel: 'HIPAA', isClickable: false, isDemo: true }
      case 'pci_score':
        return { value: `${posture.pciScore}%`, sublabel: 'PCI-DSS', isClickable: false, isDemo: true }
      case 'soc2_score':
        return { value: `${posture.soc2Score}%`, sublabel: 'SOC 2', isClickable: false, isDemo: true }

      default:
        return { value: '-' }
    }
  }, [posture])

  const configureCardData = configuringCard ? {
    id: configuringCard.id,
    card_type: configuringCard.card_type,
    config: configuringCard.config,
    title: configuringCard.title,
  } : null

  return (
    <div className="pt-16">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Database className="w-6 h-6 text-blue-400" />
                Data Compliance
                <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                  <FlaskConical className="w-3 h-3" />
                  Demo
                </span>
              </h1>
              <p className="text-muted-foreground">GDPR, HIPAA, PCI-DSS, and SOC 2 data protection compliance</p>
            </div>
            {isRefreshing && (
              <span className="flex items-center gap-1 text-xs text-amber-400 animate-pulse" title="Updating...">
                <Hourglass className="w-3 h-3" />
                <span>Updating</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="data-compliance-auto-refresh" className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground" title="Auto-refresh every 30s">
              <input
                type="checkbox"
                id="data-compliance-auto-refresh"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-border w-3.5 h-3.5"
              />
              Auto
            </label>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <StatsOverview
        dashboardType="data-compliance"
        getStatValue={getStatValue}
        hasData={true}
        isLoading={isLoading}
        lastUpdated={lastUpdated}
        collapsedStorageKey="kubestellar-data-compliance-stats-collapsed"
        isDemoData={true}
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
            <div className="grid grid-cols-12 gap-4 pb-32">
              {cards.map(card => (
                <SortableCard
                  key={card.id}
                  card={card}
                  onRemove={() => handleRemoveCard(card.id)}
                  onConfigure={() => handleConfigureCard(card.id)}
                  onWidthChange={(width) => handleWidthChange(card.id, width)}
                  isDragging={activeId === card.id}
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
