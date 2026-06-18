import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { cn } from '../../lib/cn'
import { moveFocusByKey } from '../../lib/a11y/rovingFocus'
import { SnoozedCards } from './SnoozedCards'
import type { NavSection, SidebarFeatures, SidebarNavItem } from './SidebarShell'
import type { SnoozedSwap } from '../../hooks/useSnoozedCards'
import type { SnoozedRecommendation } from '../../hooks/useSnoozedRecommendations'
import type { SnoozedMission } from '../../hooks/useSnoozedMissions'

const PRIMARY_SECTION_INDEX = 0

interface SidebarNavProps {
  children?: React.ReactNode
  features: SidebarFeatures
  isCollapsed: boolean
  isSectionOpen: (id: string) => boolean
  navSections: NavSection[]
  onAddMore?: () => void
  onOpenAddMoreFallback?: () => void
  onApplyMission: (_mission: SnoozedMission) => void
  onApplyRecommendation: (_rec: SnoozedRecommendation) => void
  onApplySwap: (_swap: SnoozedSwap) => void
  renderNavItem: (item: SidebarNavItem, sectionId: string) => React.ReactNode
  toggleSection: (id: string) => void
}

export function SidebarNav({
  children,
  features,
  isCollapsed,
  isSectionOpen,
  navSections,
  onAddMore,
  onOpenAddMoreFallback,
  onApplyMission,
  onApplyRecommendation,
  onApplySwap,
  renderNavItem,
  toggleSection,
}: SidebarNavProps) {
  const { t } = useTranslation()

  return (
    <>
      {navSections.map((section, index) => {
        const isOpen = isSectionOpen(section.id)

        return (
          <Fragment key={section.id}>
            <div>
              {index > 0 && <div className="my-6 border-t border-border/50" />}

              {section.label && !isCollapsed && (
                <button
                  onClick={() => section.collapsible && toggleSection(section.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground transition-colors',
                    section.collapsible && 'cursor-pointer',
                    !section.collapsible && 'cursor-default',
                  )}
                >
                  <span className="flex-1 text-left">{section.label}</span>
                  {section.collapsible && (
                    isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
                  )}
                </button>
              )}

              {(isOpen || !section.collapsible) && (
                <nav
                  data-testid={`sidebar-${section.id}-nav`}
                  className="space-y-1"
                  onKeyDown={(event) => {
                    moveFocusByKey(event, { selector: 'a[data-testid="sidebar-item"]', orientation: 'vertical' })
                  }}
                >
                  {section.items.map(item => renderNavItem(item, section.id))}
                </nav>
              )}
            </div>

            {index === PRIMARY_SECTION_INDEX && features.addMore && !isCollapsed && (
              <button
                data-testid="sidebar-customize"
                onClick={() => onAddMore?.() ?? onOpenAddMoreFallback?.()}
                className="w-full flex items-center gap-3 px-3 py-1.5 mt-1 text-xs text-muted-foreground/60 hover:text-muted-foreground hover:bg-secondary/30 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('sidebar.addMore', 'Add dashboard cards…')}</span>
              </button>
            )}
          </Fragment>
        )
      })}

      {features.snoozedCards && !isCollapsed && (
        <div data-tour="snoozed" className="min-w-0">
          <SnoozedCards
            onApplySwap={onApplySwap}
            onApplyRecommendation={onApplyRecommendation}
            onApplyMission={onApplyMission}
          />
        </div>
      )}

      {children}
    </>
  )
}
