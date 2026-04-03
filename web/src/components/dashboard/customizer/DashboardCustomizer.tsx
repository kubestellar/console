/**
 * DashboardCustomizer — unified customization panel (Dashboard Studio).
 *
 * Combines card catalog, AI suggestions, dashboard management, and templates
 * into a single full-screen modal with persistent left sidebar navigation.
 */
import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Palette } from 'lucide-react'
import { BaseModal } from '../../../lib/modals'
import { DashboardCustomizerSidebar } from './DashboardCustomizerSidebar'
import { PreviewPanel } from './PreviewPanel'
import { CardCatalogSection } from './sections/CardCatalogSection'
import { AISuggestionsSection } from './sections/AISuggestionsSection'
import { NavigationSection } from './sections/NavigationSection'
import { TemplateGallerySection } from './sections/TemplateGallerySection'
import { DEFAULT_SECTION, type CustomizerSection } from './customizerNav'
import type { CardSuggestion, HoveredCard } from '../shared/cardCatalog'
import type { DashboardTemplate } from '../templates'

interface DashboardCustomizerProps {
  isOpen: boolean
  onClose: () => void
  /** Name of the dashboard being customized (shown in header for context) */
  dashboardName?: string
  /** Add cards to the current dashboard */
  onAddCards: (cards: CardSuggestion[]) => void
  /** Card types already on the dashboard (for duplicate detection) */
  existingCardTypes?: string[]
  /** Initial section to open (for deep-linking) */
  initialSection?: CustomizerSection
  /** Initial search text (for deep-linking from ?cardSearch=) */
  initialSearch?: string
  /** Apply a dashboard template */
  onApplyTemplate?: (template: DashboardTemplate) => void
  /** Export current dashboard as JSON */
  onExport?: () => void
  /** Reset dashboard to defaults */
  onReset?: () => void
  /** Whether the dashboard has been customized from defaults */
  isCustomized?: boolean
  /** Undo last card mutation */
  onUndo?: () => void
  /** Redo last undone mutation */
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
}

/** Sections where the right preview panel should be visible */
const SECTIONS_WITH_PREVIEW = new Set<CustomizerSection>(['cards-browse', 'cards-ai', 'templates'])

export function DashboardCustomizer({
  isOpen,
  onClose,
  dashboardName,
  onAddCards,
  existingCardTypes = [],
  initialSection,
  initialSearch = '',
  onApplyTemplate,
  onExport: _onExport,
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
  const [globalSearch, setGlobalSearch] = useState('')
  const [hoveredCard, setHoveredCard] = useState<HoveredCard | null>(null)

  const handleHoverCard = useCallback((card: HoveredCard | null) => {
    setHoveredCard(card)
  }, [])

  const handleAddCards = useCallback((cards: CardSuggestion[]) => {
    onAddCards(cards)
  }, [onAddCards])

  const handleApplyTemplate = useCallback((template: DashboardTemplate) => {
    onApplyTemplate?.(template)
  }, [onApplyTemplate])

  const showPreview = SECTIONS_WITH_PREVIEW.has(activeSection)
  const effectiveSearch = globalSearch || initialSearch

  /** Subtitle — explains what Studio is + which dashboard is active */
  const dashboardContext = dashboardName ? ` \u00B7 ${dashboardName}` : ''
  const headerSubtitle = t('dashboard.studio.subtitle', `Add cards, apply card collections, and manage your dashboards${dashboardContext}`)

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="xl" closeOnBackdrop={false} className="!max-w-[75vw] !min-h-[70vh] !max-h-[75vh]">
      <BaseModal.Header
        title={t('dashboard.studio.title', 'Console Studio')}
        description={headerSubtitle}
        icon={Palette}
        onClose={onClose}
        showBack={false}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left sidebar */}
        <DashboardCustomizerSidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          globalSearch={globalSearch}
          onGlobalSearchChange={setGlobalSearch}
          onUndo={onUndo}
          onRedo={onRedo}
          canUndo={canUndo}
          canRedo={canRedo}
          onReset={onReset}
          isCustomized={isCustomized}
        />

        {/* Main content area */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {activeSection === 'cards-browse' && (
            <CardCatalogSection
              existingCardTypes={existingCardTypes}
              onAddCards={handleAddCards}
              onHoverCard={handleHoverCard}
              initialSearch={effectiveSearch}
              isActive={activeSection === 'cards-browse'}
            />
          )}

          {activeSection === 'cards-ai' && (
            <AISuggestionsSection
              existingCardTypes={existingCardTypes}
              onAddCards={handleAddCards}
              dashboardName={dashboardName}
            />
          )}

          {activeSection === 'dashboards' && (
            <NavigationSection onClose={onClose} />
          )}

          {activeSection === 'templates' && onApplyTemplate && (
            <TemplateGallerySection
              onApplyTemplate={handleApplyTemplate}
              dashboardName={dashboardName}
            />
          )}
        </div>

        {/* Right preview panel — only for card/template sections */}
        {showPreview && (
          <PreviewPanel hoveredCard={hoveredCard} />
        )}
      </div>
    </BaseModal>
  )
}
