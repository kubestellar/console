/**
 * DashboardCustomizer — unified customization panel (Dashboard Studio).
 *
 * Combines card catalog, AI suggestions, sidebar navigation, templates,
 * and settings into a single full-screen modal with persistent left
 * navigation. Replaces the separate AddCardModal, SidebarCustomizer,
 * and TemplatesModal.
 *
 * Design patterns:
 * - Grafana: single edit-mode surface with dashboard visible behind
 * - Notion/Linear: left sidebar + content area
 * - VS Code: global search across all sections
 * - Figma: contextual preview panel on hover
 * - Material Design: single-action FAB (Fitts's Law)
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
import { DashboardSettingsSection } from './sections/DashboardSettingsSection'
import { DEFAULT_SECTION, type CustomizerSection } from './customizerNav'
import type { CardSuggestion, HoveredCard } from '../shared/cardCatalog'
import type { DashboardTemplate } from '../templates'

interface DashboardCustomizerProps {
  isOpen: boolean
  onClose: () => void
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
  onAddCards,
  existingCardTypes = [],
  initialSection,
  initialSearch = '',
  onApplyTemplate,
  onExport,
  onReset,
  isCustomized = false,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}: DashboardCustomizerProps) {
  const { t } = useTranslation()
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

  /** Combine global search with section-specific search */
  const effectiveSearch = globalSearch || initialSearch

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="full" closeOnBackdrop={false}>
      <BaseModal.Header
        title={t('dashboard.studio.title', 'Dashboard Studio')}
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
            />
          )}

          {activeSection === 'nav-sidebar' && (
            <NavigationSection onClose={onClose} />
          )}

          {activeSection === 'nav-add' && (
            <NavigationSection onClose={onClose} />
          )}

          {activeSection === 'templates' && onApplyTemplate && (
            <TemplateGallerySection onApplyTemplate={handleApplyTemplate} />
          )}

          {activeSection === 'settings' && (
            <DashboardSettingsSection
              onExport={onExport}
              onReset={onReset}
              isCustomized={isCustomized}
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
