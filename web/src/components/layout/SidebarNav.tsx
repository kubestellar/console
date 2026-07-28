import { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { cn } from '../../lib/cn'
import { moveFocusByKey } from '../../lib/a11y/rovingFocus'
import { SidebarNavItemRow, type SidebarNavItemRowProps } from './sidebar/SidebarNavItemRow'
import type { NavSection, SidebarNavItem } from './SidebarShell'

const PRIMARY_SECTION_INDEX = 0

interface SidebarNavProps {
  navSections: NavSection[]
  isCollapsed: boolean
  canDrag: boolean
  editingItemId: string | null
  editingName: string
  draggedItem: string | null
  dragOverItem: string | null
  dragSection: string | null
  onDragStart: SidebarNavItemRowProps['onDragStart']
  onDragEnd: SidebarNavItemRowProps['onDragEnd']
  onDragEnter: SidebarNavItemRowProps['onDragEnter']
  onDragLeave: SidebarNavItemRowProps['onDragLeave']
  onDragOver: SidebarNavItemRowProps['onDragOver']
  onDrop: SidebarNavItemRowProps['onDrop']
  onDoubleClick: (item: SidebarNavItem, e: React.MouseEvent) => void
  onSaveRename: (itemId: string) => void
  onCancelRename: () => void
  onRenameChange: (value: string) => void
  onRemove: (itemId: string) => void
  showAddMore: boolean
  onAddMore: () => void
}

export function SidebarNav({
  navSections,
  isCollapsed,
  canDrag,
  editingItemId,
  editingName,
  draggedItem,
  dragOverItem,
  dragSection,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onDoubleClick,
  onSaveRename,
  onCancelRename,
  onRenameChange,
  onRemove,
  showAddMore,
  onAddMore,
}: SidebarNavProps) {
  const { t } = useTranslation()
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

  const toggleSection = (id: string) => {
    setCollapsedSections(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const renderSection = (section: NavSection, index: number) => {
    const isOpen = !collapsedSections[section.id]

    return (
      <div key={section.id}>
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
              isOpen
                ? <span className="text-xs">▾</span>
                : <span className="text-xs">▸</span>
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
            {section.items.map(item => (
              <SidebarNavItemRow
                key={item.id}
                item={item}
                sectionId={section.id}
                isCollapsed={isCollapsed}
                canDrag={canDrag}
                editingItemId={editingItemId}
                editingName={editingName}
                draggedItem={draggedItem}
                dragOverItem={dragOverItem}
                dragSection={dragSection}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragEnter={onDragEnter}
                onDragLeave={onDragLeave}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onDoubleClick={onDoubleClick}
                onSaveRename={onSaveRename}
                onCancelRename={onCancelRename}
                onRenameChange={onRenameChange}
                onRemove={onRemove}
              />
            ))}
          </nav>
        )}
      </div>
    )
  }

  return (
    <>
      {navSections.map((section, index) => {
        return (
          <Fragment key={section.id}>
            {renderSection(section, index)}

            {index === PRIMARY_SECTION_INDEX && showAddMore && !isCollapsed && (
              <button
                data-testid="sidebar-customize"
                onClick={onAddMore}
                className="w-full flex items-center gap-3 px-3 py-1.5 mt-1 text-xs text-muted-foreground/60 hover:text-muted-foreground hover:bg-secondary/30 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('sidebar.addMore', 'Add dashboard cards…')}</span>
              </button>
            )}
          </Fragment>
        )
      })}
    </>
  )
}
