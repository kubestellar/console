import { useState, useEffect, useRef, memo } from 'react'
import { createPortal } from 'react-dom'
import {
  MoreVertical, Settings, Trash2, MoveHorizontal, ChevronRight, Download, Link2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { isCardExportable } from '../../../lib/widgets/widgetRegistry'
import { copyToClipboard } from '../../../lib/clipboard'
import { useDashboardContextOptional } from '../../../hooks/useDashboardContext'

// Card width options (in grid columns out of 12)
const WIDTH_OPTIONS = [
  { value: 3, labelKey: 'cardWrapper.resizeSmall' as const, descKey: 'cardWrapper.resizeSmallDesc' as const },
  { value: 4, labelKey: 'cardWrapper.resizeMedium' as const, descKey: 'cardWrapper.resizeMediumDesc' as const },
  { value: 6, labelKey: 'cardWrapper.resizeLarge' as const, descKey: 'cardWrapper.resizeLargeDesc' as const },
  { value: 8, labelKey: 'cardWrapper.resizeWide' as const, descKey: 'cardWrapper.resizeWideDesc' as const },
  { value: 12, labelKey: 'cardWrapper.resizeFull' as const, descKey: 'cardWrapper.resizeFullDesc' as const },
]

// Card height options (in grid row spans)
const HEIGHT_OPTIONS = [
  { value: 1, labelKey: 'cardWrapper.heightCompact' as const, descKey: 'cardWrapper.heightCompactDesc' as const },
  { value: 2, labelKey: 'cardWrapper.heightDefault' as const, descKey: 'cardWrapper.heightDefaultDesc' as const },
  { value: 3, labelKey: 'cardWrapper.heightTall' as const, descKey: 'cardWrapper.heightTallDesc' as const },
  { value: 4, labelKey: 'cardWrapper.heightExtraTall' as const, descKey: 'cardWrapper.heightExtraTallDesc' as const },
]

/** Approximate height of the card action menu (px) */
const MENU_APPROX_HEIGHT = 300
/** Width of the card action menu (w-48 = 192px) */
const MENU_WIDTH_PX = 192
/** Viewport edge padding (px) */
const VIEWPORT_PADDING = 8
/** Submenu width — matches w-36 tailwind class (9rem = 144px). */
const SUBMENU_WIDTH_PX = 144
/** Right-edge margin before flipping submenu to the left side. */
const SUBMENU_EDGE_MARGIN_PX = 20

/** Compute a safe position for the menu relative to an anchor element. */
function computeMenuPosition(anchorRect: DOMRect): { top: number; right: number } {
  let top = anchorRect.bottom + 4
  let right = window.innerWidth - anchorRect.right

  if (top + MENU_APPROX_HEIGHT > window.innerHeight - VIEWPORT_PADDING) {
    top = Math.max(VIEWPORT_PADDING, anchorRect.top - MENU_APPROX_HEIGHT - 4)
  }
  if (right < VIEWPORT_PADDING) {
    right = VIEWPORT_PADDING
  }
  const leftEdge = window.innerWidth - right - MENU_WIDTH_PX
  if (leftEdge < VIEWPORT_PADDING) {
    right = window.innerWidth - MENU_WIDTH_PX - VIEWPORT_PADDING
  }
  return { top, right }
}

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

  const [showMenu, setShowMenu] = useState(false)
  const [showResizeMenu, setShowResizeMenu] = useState(false)
  const [showHeightMenu, setShowHeightMenu] = useState(false)
  const [resizeMenuOnLeft, setResizeMenuOnLeft] = useState(false)
  const [heightMenuOnLeft, setHeightMenuOnLeft] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null)

  const menuContainerRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const heightMenuContainerRef = useRef<HTMLDivElement>(null)

  // Close resize/height submenus when main menu closes (#7869)
  useEffect(() => {
    if (!showMenu) {
      setShowResizeMenu(false)
      setShowHeightMenu(false)
      setMenuPosition(null)
    }
  }, [showMenu])

  // Close this menu when another card's menu opens (#8556).
  useEffect(() => {
    function handleOtherMenuOpen(e: Event) {
      const detail = (e as CustomEvent).detail
      if (detail !== cardId && showMenu) {
        setShowMenu(false)
      }
    }
    window.addEventListener('card-menu-open', handleOtherMenuOpen)
    return () => window.removeEventListener('card-menu-open', handleOtherMenuOpen)
  }, [showMenu, cardId])

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
        setShowMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenu])

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
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = e.currentTarget.querySelectorAll<HTMLElement>('button[role="menuitem"]:not([disabled])')
    const idx = Array.from(items).indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') items[Math.min(idx + 1, items.length - 1)]?.focus()
    else items[Math.max(idx - 1, 0)]?.focus()
  }

  return (
    <div className="relative" data-tour="card-menu">
      <button
        ref={menuButtonRef}
        onClick={() => {
          if (!showMenu && menuButtonRef.current) {
            setMenuPosition(computeMenuPosition(menuButtonRef.current.getBoundingClientRect()))
          }
          const opening = !showMenu
          if (opening) {
            window.dispatchEvent(new CustomEvent('card-menu-open', { detail: cardId }))
          }
          setShowMenu(opening)
        }}
        className="p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
        aria-label={t('cardWrapper.cardMenuTooltip')}
        aria-expanded={showMenu}
        aria-haspopup="menu"
        title={t('cardWrapper.cardMenuTooltip')}
      >
        <MoreVertical className="w-4 h-4" aria-hidden="true" />
      </button>
      {showMenu && menuPosition && createPortal(
        <div
          data-card-action-menu
          className="fixed w-48 glass rounded-lg py-1 z-50 shadow-xl bg-glass-overlay!"
          role="menu"
          aria-label={t('cardWrapper.cardMenuTooltip')}
          style={{ top: menuPosition.top, right: menuPosition.right }}
          onKeyDown={handleMenuKeyDown}
        >
          <button
            onClick={() => { setShowMenu(false); onConfigure?.() }}
            className="w-full px-4 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 flex items-center gap-2"
            role="menuitem"
            title={t('cardWrapper.configureTooltip')}
          >
            <Settings className="w-4 h-4" aria-hidden="true" />
            {t('common:actions.configure')}
          </button>
          <button
            onClick={() => {
              setShowMenu(false)
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
            <div className="relative" ref={menuContainerRef}>
              <button
                onClick={() => { setShowResizeMenu(!showResizeMenu); setShowHeightMenu(false) }}
                className="w-full px-4 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 flex flex-wrap items-center justify-between gap-y-2"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={showResizeMenu}
                title={t('cardWrapper.resizeTooltip')}
              >
                <span className="flex items-center gap-2">
                  <MoveHorizontal className="w-4 h-4" aria-hidden="true" />
                  {t('cardWrapper.resize')}
                </span>
                <ChevronRight className={cn('w-4 h-4 transition-transform', showResizeMenu && 'rotate-90')} aria-hidden="true" />
              </button>
              {showResizeMenu && (
                <div
                  className={cn('absolute top-0 w-36 glass rounded-lg py-1 z-20', resizeMenuOnLeft ? 'right-full mr-1' : 'left-full ml-1')}
                  role="menu"
                  onKeyDown={handleMenuKeyDown}
                >
                  {WIDTH_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => { onWidthChange(option.value); setShowResizeMenu(false); setShowMenu(false) }}
                      className={cn(
                        'w-full px-3 py-2 text-left text-sm flex flex-wrap items-center justify-between gap-y-2',
                        cardWidth === option.value
                          ? 'text-purple-400 bg-purple-500/10'
                          : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                      )}
                      role="menuitem"
                    >
                      <span>{t(option.labelKey)}</span>
                      <span className="text-xs opacity-60">{t(option.descKey)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Resize height submenu (#6463) */}
          {onHeightChange && (
            <div className="relative" ref={heightMenuContainerRef}>
              <button
                onClick={() => { setShowHeightMenu(!showHeightMenu); setShowResizeMenu(false) }}
                className="w-full px-4 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 flex flex-wrap items-center justify-between gap-y-2"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={showHeightMenu}
                title={t('cardWrapper.resizeHeightTooltip')}
              >
                <span className="flex items-center gap-2">
                  <MoveHorizontal className="w-4 h-4 rotate-90" aria-hidden="true" />
                  {t('cardWrapper.resizeHeight')}
                </span>
                <ChevronRight className={cn('w-4 h-4 transition-transform', showHeightMenu && 'rotate-90')} aria-hidden="true" />
              </button>
              {showHeightMenu && (
                <div
                  className={cn('absolute top-0 w-36 glass rounded-lg py-1 z-20', heightMenuOnLeft ? 'right-full mr-1' : 'left-full ml-1')}
                  role="menu"
                  onKeyDown={handleMenuKeyDown}
                >
                  {HEIGHT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => { onHeightChange(option.value); setShowHeightMenu(false); setShowMenu(false) }}
                      className={cn(
                        'w-full px-3 py-2 text-left text-sm flex flex-wrap items-center justify-between gap-y-2',
                        cardHeight === option.value
                          ? 'text-purple-400 bg-purple-500/10'
                          : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                      )}
                      role="menuitem"
                    >
                      <span>{t(option.labelKey)}</span>
                      <span className="text-xs opacity-60">{t(option.descKey)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {isCardExportable(cardType) && (
            <button
              onClick={() => {
                setShowMenu(false)
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
            onClick={() => { setShowMenu(false); onRemove?.() }}
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
