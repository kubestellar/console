/**
 * Console Studio — unified customization panel.
 *
 * Combines cards (AI + browse), card factories, dashboards, and card collections
 * into a single modal with flat left navigation.
 */
import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Palette, Undo2, Redo2, RotateCcw } from 'lucide-react'
import { BaseModal } from '../../../lib/modals'
import { DashboardCustomizerSidebar } from './DashboardCustomizerSidebar'
import { PreviewPanel } from './PreviewPanel'
import { UnifiedCardsSection } from './sections/UnifiedCardsSection'
import { NavigationSection } from './sections/NavigationSection'
import { TemplateGallerySection } from './sections/TemplateGallerySection'
import { CardFactoryModal } from '../CardFactoryModal'
import { StatBlockFactoryModal } from '../StatBlockFactoryModal'
import { CreateDashboardModal } from '../CreateDashboardModal'
import { WidgetExportModal } from '../../widgets/WidgetExportModal'
import { DEFAULT_SECTION, type CustomizerSection } from './customizerNav'
import { useNavigate } from 'react-router-dom'
import { useDashboards } from '../../../hooks/useDashboards'
import { useSidebarConfig } from '../../../hooks/useSidebarConfig'
import { suggestIconSync } from '../../../lib/iconSuggester'
import type { CardSuggestion, HoveredCard } from '../shared/cardCatalog'
import type { DashboardTemplate } from '../templates'

interface DashboardCustomizerProps {
  isOpen: boolean
  onClose: () => void
  /** Name of the dashboard being customized */
  dashboardName?: string
  onAddCards: (cards: CardSuggestion[]) => void
  existingCardTypes?: string[]
  initialSection?: CustomizerSection
  /** Pre-selected card type for widget export (from card menu "Export as Widget") */
  initialWidgetCardType?: string
  initialSearch?: string
  onApplyTemplate?: (template: DashboardTemplate) => void
  onExport?: () => void
  onReset?: () => void
  isCustomized?: boolean
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
}

const SECTIONS_WITH_PREVIEW = new Set<CustomizerSection>(['cards', 'collections'])

export function DashboardCustomizer({
  isOpen,
  onClose,
  dashboardName,
  onAddCards,
  existingCardTypes = [],
  initialSection,
  initialWidgetCardType,
  initialSearch = '',
  onApplyTemplate,
  onReset,
  isCustomized = false,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}: DashboardCustomizerProps) {
  const { t: _t } = useTranslation()
  const t = _t as (key: string, defaultValue?: string) => string
  // User-driven section selection (null = use initialSection prop)
  const [userSelectedSection, setUserSelectedSection] = useState<CustomizerSection | null>(null)

  // Reset user selection when modal opens so initialSection takes effect
  // eslint-disable-next-line react-hooks/set-state-in-effect -- needed to sync with external isOpen prop
  useEffect(() => { if (isOpen) setUserSelectedSection(null) }, [isOpen])

  const activeSection = userSelectedSection || initialSection || DEFAULT_SECTION

  // Global search reserved for future use
  const globalSearch = ''
  const [hoveredCard, setHoveredCard] = useState<HoveredCard | null>(null)
  const { dashboards, createDashboard: _createDashboard } = useDashboards()
  const { addItem } = useSidebarConfig()
  const navigate = useNavigate()

  const handleHoverCard = useCallback((card: HoveredCard | null) => setHoveredCard(card), [])
  const handleAddCards = useCallback((cards: CardSuggestion[]) => { onAddCards(cards); onClose() }, [onAddCards, onClose])
  const handleApplyTemplate = useCallback((tpl: DashboardTemplate) => { onApplyTemplate?.(tpl); onClose() }, [onApplyTemplate, onClose])

  const showPreview = SECTIONS_WITH_PREVIEW.has(activeSection)
  const effectiveSearch = globalSearch || initialSearch

  return (
    <>
    <BaseModal isOpen={isOpen} onClose={onClose} size="xl" closeOnBackdrop={false} className="max-w-[75vw]! h-[75vh]!">
      <BaseModal.Header
        title={t('dashboard.studio.title', 'Console Studio')}
        description={t('dashboard.studio.subtitle', 'Your console is built from dashboards containing cards and stat blocks that show real-time cluster data. Browse cards, apply collections, or create custom visualizations.')}
        icon={Palette}
        onClose={onClose}
        showBack={false}
      />

      <div data-testid="console-studio" className="flex flex-1 min-h-0 overflow-hidden">
        <DashboardCustomizerSidebar
          activeSection={activeSection}
          onSectionChange={setUserSelectedSection}
        />

        {/* Main content — fixed height, sections fill this space */}
        <div data-testid="studio-preview" className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {activeSection === 'cards' && (
            <UnifiedCardsSection
              existingCardTypes={existingCardTypes}
              onAddCards={handleAddCards}
              onHoverCard={handleHoverCard}
              initialSearch={effectiveSearch}
              isActive={activeSection === 'cards'}
              dashboardName={dashboardName}
            />
          )}

          {activeSection === 'dashboards' && (
            <NavigationSection onClose={onClose} dashboardName={dashboardName} />
          )}

          {activeSection === 'collections' && onApplyTemplate && (
            <TemplateGallerySection
              onReplaceWithTemplate={handleApplyTemplate}
              onAddTemplate={(template) => {
                // Convert template cards to CardSuggestion format and add
                const cards = (template.cards || []).map(c => ({
                  type: c.card_type,
                  title: c.card_type,
                  description: '',
                  visualization: 'status' as const,
                  config: c.config || {},
                }))
                handleAddCards(cards)
              }}
              dashboardName={dashboardName}
            />
          )}

          {activeSection === 'widgets' && (
            <WidgetExportModal
              isOpen={true}
              onClose={() => setUserSelectedSection('cards')}
              cardType={initialWidgetCardType}
              embedded
            />
          )}

          {activeSection === 'create-dashboard' && (
            <CreateDashboardModal
              isOpen={true}
              onClose={() => setUserSelectedSection('dashboards')}
              onCreate={async (name, _template, _description) => {
                // Add sidebar item and navigate immediately
                const localId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
                const href = `/custom-dashboard/${localId}`
                addItem({ name, icon: suggestIconSync(name), href, type: 'link' }, 'primary')
                onClose()
                navigate(href)
                // Persist to backend in background
                _createDashboard(name).catch(() => { /* offline — sidebar item already added */ })
              }}
              existingNames={dashboards.map(d => d.name)}
              embedded
            />
          )}

          {/* Factory sections — rendered inline via embedded mode */}
          {activeSection === 'card-factory' && (
            <CardFactoryModal
              isOpen={true}
              onClose={() => setUserSelectedSection('cards')}
              onCardCreated={(cardId) => {
                onAddCards([{
                  type: 'dynamic_card',
                  title: 'Custom Card',
                  description: 'Dynamically created card',
                  visualization: 'status',
                  config: { dynamicCardId: cardId },
                }])
                setUserSelectedSection('cards')
              }}
              embedded
            />
          )}

          {activeSection === 'stat-factory' && (
            <StatBlockFactoryModal
              isOpen={true}
              onClose={() => setUserSelectedSection('cards')}
              embedded
            />
          )}
        </div>

        {showPreview && (
          <PreviewPanel hoveredCard={hoveredCard} />
        )}
      </div>

      {/* Footer — always rendered to prevent height shift when undo/redo state changes */}
      <div className={`border-t border-border px-4 py-2 flex items-center gap-2 shrink-0 transition-opacity ${
        canUndo || canRedo || (isCustomized && onReset) ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}>
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Undo2 className="w-3.5 h-3.5" />
          Undo
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Redo2 className="w-3.5 h-3.5" />
          Redo
        </button>
        {isCustomized && onReset && (
          <>
            <div className="flex-1" />
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-md transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Dashboard
            </button>
          </>
        )}
      </div>
    </BaseModal>

      {/* Factories render inline via embedded prop — no separate modals */}
    </>
  )
}
