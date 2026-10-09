import { useState, useEffect, useRef, memo } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical, Settings, Trash2, Download, Link2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { isCardExportable } from '../../../lib/widgets/widgetRegistry'
import { copyToClipboard } from '../../../lib/clipboard'
import { useDashboardContextOptional } from '../../../hooks/useDashboardContext'
import { useModalState } from '../../../lib/modals'
import {
  WIDTH_OPTIONS, HEIGHT_OPTIONS, MENU_ITEM_SELECTOR, SUBMENU_WIDTH_PX, SUBMENU_EDGE_MARGIN_PX, computeMenuPosition,
} from './CardActionMenu.constants'
import { ResizeSubmenu } from './ResizeSubmenu'

// Auto-QA #21201: pure UI component — no async data fetch; loading/error state not applicable.
// All interactions are synchronous event handlers and portal positioning (no network calls).

export interface CardActionMenuProps {
  cardId?: string
  cardType: string
  cardWidth?: number
  cardHeight?: number
  onConfigure?: () => void
  onRemove?: () => void
  onWidthChange?: (w: number) => void
  onHeightChange?: (h: number) => void
  onShowWidgetExport: () => void
}

/**
 * Three-dot action menu rendered via portal. Includes resize width/height
 * submenus, configure, copy link, export widget, and remove actions.
 */
export const CardActionMenu = memo(function CardActionMenu({
  cardId,
  cardType,
  cardWidth,
  cardHeight,
  onConfigure,
  onRemove,
  onWidthChange,
  onHeightChange,
  onShowWidgetExport,
}: CardActionMenuProps) {
  const { t } = useTranslation(['cards', 'common'])
  const studioContext = useDashboardContextOptional()

  const { isOpen: showMenu, open: openMenu, close: closeMenu } = useModalState()
  const { isOpen: showResizeMenu, open: openResizeMenu, close: closeResizeMenu } = useModalState()
  const { isOpen: showHeightMenu, open: openHeightMenu, close: closeHeightMenu } = useModalState()
  const [resizeMenuOnLeft, setResizeMenuOnLeft] = useState(false)
  const [heightMenuOnLeft, setHeightMenuOnLeft] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null)

  const menuContainerRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const resizeMenuRef = useRef<HTMLDivElement>(null)
  const heightMenuContainerRef = useRef<HTMLDivElement>(null)
  const heightMenuRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef(false)
  const widthOptions = WIDTH_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey), desc: t(o.descKey) }))
  const heightOptions = HEIGHT_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey), desc: t(o.descKey) }))
  const menuId = `card-action-menu-${cardId || cardType}`
  const resizeMenuId = `${menuId}-resize`
  const heightMenuId = `${menuId}-height`
  const openRootMenu = () => {
    if (menuButtonRef.current) {
      setMenuPosition(computeMenuPosition(menuButtonRef.current.getBoundingClientRect()))
    }
    window.dispatchEvent(new CustomEvent('card-menu-open', { detail: cardId }))
    openMenu()
  }

  // Close resize/height submenus when main menu closes (#7869)
  useEffect(() => {
    if (!showMenu) {
      closeResizeMenu()
      closeHeightMenu()
      setMenuPosition(null)
      if (restoreFocusRef.current) {
        menuButtonRef.current?.focus()
        restoreFocusRef.current = false
      }
    }
  }, [showMenu, closeResizeMenu, closeHeightMenu])

  useEffect(() => {
    if (!showMenu) return
    const firstItem = menuRef.current?.querySelector<HTMLElement>(MENU_ITEM_SELECTOR)
    firstItem?.focus()
  }, [showMenu])

  useEffect(() => {
    if (!showResizeMenu) return
    const firstItem = resizeMenuRef.current?.querySelector<HTMLElement>(MENU_ITEM_SELECTOR)
    firstItem?.focus()
  }, [showResizeMenu])

  useEffect(() => {
    if (!showHeightMenu) return
    const firstItem = heightMenuRef.current?.querySelector<HTMLElement>(MENU_ITEM_SELECTOR)
    firstItem?.focus()
  }, [showHeightMenu])

  // Close this menu when another card's menu opens (#8556).
  useEffect(() => {
    function handleOtherMenuOpen(e: Event) {
      const detail = (e as CustomEvent).detail
      if (detail !== cardId && showMenu) {
        closeMenu()
      }
    }
    window.addEventListener('card-menu-open', handleOtherMenuOpen)
    return () => window.removeEventListener('card-menu-open', handleOtherMenuOpen)
  }, [showMenu, cardId, closeMenu])

  // Keep menu anchored to button on scroll/resize (#5253).
  useEffect(() => {
    if (!showMenu || !menuButtonRef.current) return

    const updatePosition = () => {
      if (menuButtonRef.current) {
        setMenuPosition(computeMenuPosition(menuButtonRef.current.getBoundingClientRect()))
      }
    }

    // Find the scrollable parent (the main content area)
    let scrollParent: HTMLElement | Window = window
    let el = menuButtonRef.current.parentElement
    while (el) {
      const overflow = window.getComputedStyle(el).overflowY
      if (overflow === 'auto' || overflow === 'scroll') {
        scrollParent = el
        break
      }
      el = el.parentElement
    }

    scrollParent.addEventListener('scroll', updatePosition, { passive: true })
    window.addEventListener('resize', updatePosition, { passive: true })
    return () => {
      scrollParent.removeEventListener('scroll', updatePosition)
      window.removeEventListener('resize', updatePosition)
    }
  }, [showMenu])

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-tour="card-menu"]') && !target.closest('[data-card-action-menu]')) {
        closeMenu()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenu, closeMenu])

  // Flip resize submenu to left when near viewport edge
  useEffect(() => {
    if (showResizeMenu && menuContainerRef.current) {
      const rect = menuContainerRef.current.getBoundingClientRect()
      setResizeMenuOnLeft(rect.right + SUBMENU_WIDTH_PX + SUBMENU_EDGE_MARGIN_PX > window.innerWidth)
    }
  }, [showResizeMenu])

  // Flip height submenu to left when near viewport edge
  useEffect(() => {
    if (showHeightMenu && heightMenuContainerRef.current) {
      const rect = heightMenuContainerRef.current.getBoundingClientRect()
      setHeightMenuOnLeft(rect.right + SUBMENU_WIDTH_PX + SUBMENU_EDGE_MARGIN_PX > window.innerWidth)
    }
  }, [showHeightMenu])

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      restoreFocusRef.current = true
      closeResizeMenu()
      closeHeightMenu()
      closeMenu()
      return
    }
    if (e.key === 'ArrowLeft' && (showResizeMenu || showHeightMenu)) {
      e.preventDefault()
      closeResizeMenu()
      closeHeightMenu()
      menuRef.current?.querySelector<HTMLElement>(MENU_ITEM_SELECTOR)?.focus()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const items = e.currentTarget.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)
    if (e.key === 'Home') {
      items[0]?.focus()
      return
    }
    if (e.key === 'End') {
      items[items.length - 1]?.focus()
      return
    }
    const idx = Array.from(items).indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') items[Math.min(idx + 1, items.length - 1)]?.focus()
    else items[Math.max(idx - 1, 0)]?.focus()
  }

  return (
    <div className="relative" data-tour="card-menu">
      <button
        ref={menuButtonRef}
        onClick={() => {
          const opening = !showMenu
          if (opening) {
            openRootMenu()
          } else {
            closeMenu()
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            if (!showMenu) openRootMenu()
          }
        }}
        className="p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
        aria-label={t('cardWrapper.cardMenuTooltip')}
        aria-expanded={showMenu}
        aria-haspopup="menu"
        aria-controls={showMenu ? menuId : undefined}
        title={t('cardWrapper.cardMenuTooltip')}
      >
        <MoreVertical className="w-4 h-4" aria-hidden="true" />
      </button>
      {showMenu && menuPosition && createPortal(
        <div
          id={menuId}
          ref={menuRef}
          data-card-action-menu
          className="fixed w-48 glass rounded-lg py-1 z-50 shadow-xl bg-glass-overlay!"
          role="menu"
          aria-label={t('cardWrapper.cardMenuTooltip')}
          style={{ top: menuPosition.top, right: menuPosition.right }}
          onKeyDown={handleMenuKeyDown}
        >
          <button
            onClick={() => { closeMenu(); onConfigure?.() }}
            className="w-full px-4 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 flex items-center gap-2"
            role="menuitem"
            title={t('cardWrapper.configureTooltip')}
          >
            <Settings className="w-4 h-4" aria-hidden="true" />
            {t('common:actions.configure')}
          </button>
          <button
            onClick={() => {
              closeMenu()
              const url = `${window.location.origin}${window.location.pathname}?card=${cardType}`
              copyToClipboard(url)
            }}
            className="w-full px-4 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 flex items-center gap-2"
            role="menuitem"
            title={t('cardWrapper.copyLinkTooltip')}
          >
            <Link2 className="w-4 h-4" aria-hidden="true" />
            {t('cardWrapper.copyLink')}
          </button>

          {/* Resize width submenu */}
          {onWidthChange && (
            <ResizeSubmenu
              containerRef={menuContainerRef}
              submenuRef={resizeMenuRef}
              menuId={resizeMenuId}
              isOpen={showResizeMenu}
              onLeft={resizeMenuOnLeft}
              onOpen={openResizeMenu}
              onClose={closeResizeMenu}
              onCloseSibling={closeHeightMenu}
              onCloseRoot={closeMenu}
              onKeyDown={handleMenuKeyDown}
              options={widthOptions}
              currentValue={cardWidth}
              onChange={onWidthChange}
              label={t('cardWrapper.resize')}
              tooltip={t('cardWrapper.resizeTooltip')}
            />
          )}

          {/* Resize height submenu (#6463) */}
          {onHeightChange && (
            <ResizeSubmenu
              containerRef={heightMenuContainerRef}
              submenuRef={heightMenuRef}
              menuId={heightMenuId}
              isOpen={showHeightMenu}
              onLeft={heightMenuOnLeft}
              onOpen={openHeightMenu}
              onClose={closeHeightMenu}
              onCloseSibling={closeResizeMenu}
              onCloseRoot={closeMenu}
              onKeyDown={handleMenuKeyDown}
              options={heightOptions}
              currentValue={cardHeight}
              onChange={onHeightChange}
              label={t('cardWrapper.resizeHeight')}
              tooltip={t('cardWrapper.resizeHeightTooltip')}
              iconClassName="rotate-90"
            />
          )}

          {isCardExportable(cardType) && (
            <button
              onClick={() => {
                closeMenu()
                if (studioContext?.openAddCardModal) {
                  studioContext.openAddCardModal('widgets', cardType)
                } else {
                  onShowWidgetExport()
                }
              }}
              className="w-full px-4 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 flex items-center gap-2"
              role="menuitem"
              title={t('cardWrapper.exportWidgetTooltip')}
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              {t('cardWrapper.exportWidget')}
            </button>
          )}

          <button
            onClick={() => { closeMenu(); onRemove?.() }}
            className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"
            role="menuitem"
            title={t('cardWrapper.removeTooltip')}
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            {t('common:actions.remove')}
          </button>
        </div>,
        document.body
      )}
    </div>
  )
})
