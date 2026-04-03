/**
 * Console Studio — unified customization panel.
 *
 * Combines cards (AI + browse), card factories, dashboards, and card collections
 * into a single modal with flat left navigation.
 */
import { useState, useCallback } from 'react'
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
import { DEFAULT_SECTION, type CustomizerSection } from './customizerNav'
import { useDashboards } from '../../../hooks/useDashboards'
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
  const [activeSection, setActiveSection] = useState<CustomizerSection>(initialSection || DEFAULT_SECTION)
  // Global search reserved for future use
  const globalSearch = ''
  const [hoveredCard, setHoveredCard] = useState<HoveredCard | null>(null)
  const { dashboards, createDashboard: _createDashboard } = useDashboards()

  const handleHoverCard = useCallback((card: HoveredCard | null) => setHoveredCard(card), [])
  const handleAddCards = useCallback((cards: CardSuggestion[]) => onAddCards(cards), [onAddCards])
  const handleApplyTemplate = useCallback((tpl: DashboardTemplate) => onApplyTemplate?.(tpl), [onApplyTemplate])

  const showPreview = SECTIONS_WITH_PREVIEW.has(activeSection)
  const effectiveSearch = globalSearch || initialSearch

  return (
    <>
    <BaseModal isOpen={isOpen} onClose={onClose} size="xl" closeOnBackdrop={false} className="!max-w-[75vw] !h-[75vh]">
      <BaseModal.Header
        title={t('dashboard.studio.title', 'Console Studio')}
        description={t('dashboard.studio.subtitle', 'Your console is built from dashboards containing cards and stat blocks that show real-time cluster data. Browse cards, apply collections, or create custom visualizations.')}
        icon={Palette}
        onClose={onClose}
        showBack={false}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <DashboardCustomizerSidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
        />

        {/* Main content — fixed height, sections fill this space */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
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
            <NavigationSection onClose={onClose} />
          )}

          {activeSection === 'collections' && onApplyTemplate && (
            <TemplateGallerySection
              onApplyTemplate={handleApplyTemplate}
              dashboardName={dashboardName}
            />
          )}

          {activeSection === 'create-dashboard' && (
            <CreateDashboardModal
              isOpen={true}
              onClose={() => setActiveSection('dashboards')}
              onCreate={async (name) => {
                await _createDashboard(name)
                setActiveSection('dashboards')
              }}
              existingNames={dashboards.map(d => d.name)}
              embedded
            />
          )}

          {/* Factory sections — rendered inline via embedded mode */}
          {activeSection === 'card-factory' && (
            <CardFactoryModal
              isOpen={true}
              onClose={() => setActiveSection('cards')}
              onCardCreated={(cardId) => {
                onAddCards([{
                  type: 'dynamic_card',
                  title: 'Custom Card',
                  description: 'Dynamically created card',
                  visualization: 'status',
                  config: { dynamicCardId: cardId },
                }])
                setActiveSection('cards')
              }}
              embedded
            />
          )}

          {activeSection === 'stat-factory' && (
            <StatBlockFactoryModal
              isOpen={true}
              onClose={() => setActiveSection('cards')}
              embedded
            />
          )}
        </div>

        {showPreview && (
          <PreviewPanel hoveredCard={hoveredCard} />
        )}
      </div>

      {/* Footer — dashboard actions (undo/redo/reset) */}
      {(canUndo || canRedo || (isCustomized && onReset)) && (
        <div className="border-t border-border px-4 py-2 flex items-center gap-2">
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
      )}
    </BaseModal>

      {/* Factories render inline via embedded prop — no separate modals */}
    </>
  )
}
