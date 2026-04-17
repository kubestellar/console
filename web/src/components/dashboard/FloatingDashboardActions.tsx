import { useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { Plus, Layout, RotateCcw, Download, Pencil, Undo2, Redo2, Palette } from 'lucide-react'
import { useModalState } from '../../lib/modals'
import { useMissions } from '../../hooks/useMissions'
import { useMobile } from '../../hooks/useMobile'
import { useFeatureHints } from '../../hooks/useFeatureHints'
import { ResetMode } from '../../hooks/useDashboardReset'
import { ResetDialog } from './ResetDialog'
import { SidebarCustomizer } from '../layout/SidebarCustomizer'
import { DashboardHealthIndicator } from './DashboardHealthIndicator'

interface FloatingDashboardActionsProps {
  /** New: open unified Dashboard Studio customizer */
  onOpenCustomizer?: () => void
  /** Legacy: open add card modal (used when DashboardCustomizer not wired in yet) */
  onAddCard?: () => void
  /** Legacy: open templates modal */
  onOpenTemplates?: () => void
  /** Callback for reset with mode selection */
  onReset?: (mode: ResetMode) => number
  /** Legacy: callback to reset dashboard to default cards (replace mode only) */
  onResetToDefaults?: () => void
  /** Whether the dashboard has been customized from defaults */
  isCustomized?: boolean
  /** Export current dashboard as JSON file */
  onExport?: () => void
  /** Import a dashboard from JSON file (reserved for future use) */
  onImport?: (json: unknown) => void
  /** Undo last card mutation */
  onUndo?: () => void
  /** Redo last undone mutation */
  onRedo?: () => void
  /** Whether undo is available */
  canUndo?: boolean
  /** Whether redo is available */
  canRedo?: boolean
}

/**
 * Floating action button for dashboard customization.
 *
 * When `onOpenCustomizer` is provided, renders as a single FAB button
 * that opens Dashboard Studio + inline undo/redo.
 *
 * When `onOpenCustomizer` is NOT provided (legacy mode), renders the
 * old expandable menu with individual actions.
 */
export function FloatingDashboardActions({
  onOpenCustomizer,
  onAddCard,
  onOpenTemplates,
  onReset,
  onResetToDefaults,
  isCustomized,
  onExport,
  // onImport accepted but not rendered in FAB menu (reserved for future use)
  onImport: _,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}: FloatingDashboardActionsProps) {
  const { t } = useTranslation()
  const { isSidebarOpen, isSidebarMinimized, isFullScreen: isMissionFullScreen } = useMissions()
  const { isMobile } = useMobile()
  const [searchParams, setSearchParams] = useSearchParams()
  const fabHint = useFeatureHints('fab-add')
  const menu = useModalState()
  const resetDialog = useModalState()
  const customizer = useModalState()
  const menuRef = useRef<HTMLDivElement>(null)
  const { isOpen: menuIsOpen, close: closeMenu } = menu
  const { open: openCustomizer } = customizer

  // Use unified mode when onOpenCustomizer is provided
  const isUnifiedMode = !!onOpenCustomizer

  // Auto-open via URL params
  useEffect(() => {
    if (isUnifiedMode) {
      // Unified mode: URL params handled by parent DashboardPage
      return
    }
    if (searchParams.get('customizeSidebar') === 'true') {
      openCustomizer()
      const cleaned = new URLSearchParams(searchParams)
      cleaned.delete('customizeSidebar')
      setSearchParams(cleaned, { replace: true })
    }
  }, [searchParams, setSearchParams, openCustomizer, isUnifiedMode])

  // Cmd+K shortcut — unified mode only
  useEffect(() => {
    if (!isUnifiedMode) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onOpenCustomizer!()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isUnifiedMode, onOpenCustomizer])

  // Close menu when clicking outside (legacy mode)
  useEffect(() => {
    if (!menuIsOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu()
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [menuIsOpen, closeMenu])

  const getPositionClasses = () => {
    if (isMobile) return 'left-4 bottom-4'
    // right-10 (40px) instead of right-6 (24px) — the scrollbar on
    // the main content area eats ~15px of viewport width, so right-6
    // left the 40px button clipped to a half-circle (#8464 follow-up).
    if (!isSidebarOpen) return 'right-10 bottom-20'
    if (isSidebarMinimized) return 'right-[88px] bottom-20'
    return 'right-[552px] bottom-20'
  }
  const positionClasses = getPositionClasses()

  const handleReset = (mode: ResetMode) => {
    resetDialog.close()
    if (onReset) {
      onReset(mode)
    } else if (onResetToDefaults && mode === 'replace') {
      onResetToDefaults()
    }
  }

  // Hide the Console Studio FAB when the AI Mission sidebar is expanded to
  // full-screen (#6130). In full-screen mode the mission list and chat UI
  // cover the whole viewport, and the FAB would overlap them.
  if (isMissionFullScreen) return null

  const showResetOption = isCustomized && (onReset || onResetToDefaults)
  const menuBtnClass = "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors whitespace-nowrap"

  // =========================================================================
  // Unified mode: single FAB + inline undo/redo
  // =========================================================================
  if (isUnifiedMode) {
    const showActions = canUndo || canRedo || showResetOption
    return (
      <div className={`fixed ${positionClasses} z-sticky flex ${isMobile ? 'items-start' : 'items-end'} gap-1.5 transition-all duration-300`}>
        {showActions && (
          <div className="flex gap-1 p-1 bg-card border border-border rounded-lg shadow-md animate-in fade-in duration-150 mr-1">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title={`${t('dashboard.actions.undo', 'Undo')} (${navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'}+Z)`}
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title={`${t('dashboard.actions.redo', 'Redo')} (${navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'}+Shift+Z)`}
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
            {showResetOption && (
              <button
                onClick={() => { if (onReset) onReset('replace'); else if (onResetToDefaults) onResetToDefaults() }}
                className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title={t('dashboard.actions.reset', 'Reset dashboard to defaults')}
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
        <button
          data-tour="fab-button"
          onClick={() => { onOpenCustomizer!(); fabHint.action() }}
          className={`flex items-center justify-center rounded-full shadow-lg transition-all duration-200 ${
            isMobile ? 'w-8 h-8' : 'w-10 h-10'
          } bg-gradient-ks hover:scale-110 hover:shadow-xl ${
            fabHint.isVisible ? 'animate-fab-shimmer' : ''
          }`}
          title={`${t('dashboard.studio.title', 'Console Studio')} (${navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'}+K)`}
        >
          <Palette className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-foreground`} />
        </button>
      </div>
    )
  }

  // =========================================================================
  // Legacy mode: expandable FAB menu (for Dashboard.tsx, CustomDashboard.tsx, etc.)
  // =========================================================================
  return (
    <>
      <div ref={menuRef} className={`fixed ${positionClasses} z-sticky flex flex-col ${isMobile ? 'items-start' : 'items-end'} gap-1.5 transition-all duration-300`}>
        {menu.isOpen && (
          <div
            role="menu"
            className="flex flex-col gap-1.5 p-2 bg-card border border-border rounded-lg shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-150"
            aria-label={t('dashboard.actions.dashboardActions')}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
              e.preventDefault()
              const items = e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')
              const idx = Array.from(items).indexOf(document.activeElement as HTMLElement)
              if (e.key === 'ArrowDown') items[Math.min(idx + 1, items.length - 1)]?.focus()
              else items[Math.max(idx - 1, 0)]?.focus()
            }}
          >
            <div className="px-1 pb-1 border-b border-border/50 mb-0.5">
              <DashboardHealthIndicator size="sm" />
            </div>
            {onExport && (
              <button role="menuitem" onClick={() => { menu.close(); onExport() }} className={menuBtnClass} title={t('dashboard.actions.exportTitle')}>
                <Download className="w-3.5 h-3.5" />
                {t('dashboard.actions.export')}
              </button>
            )}
            {(canUndo || canRedo) && (
              <div className="flex gap-1">
                <button role="menuitem" onClick={() => { onUndo?.() }} disabled={!canUndo} className={`${menuBtnClass} ${!canUndo ? 'opacity-40 cursor-not-allowed' : ''}`}>
                  <Undo2 className="w-3.5 h-3.5" />
                  {t('dashboard.actions.undo')}
                </button>
                <button role="menuitem" onClick={() => { onRedo?.() }} disabled={!canRedo} className={`${menuBtnClass} ${!canRedo ? 'opacity-40 cursor-not-allowed' : ''}`}>
                  <Redo2 className="w-3.5 h-3.5" />
                  {t('dashboard.actions.redo')}
                </button>
              </div>
            )}
            {showResetOption && (
              <button role="menuitem" onClick={() => { menu.close(); resetDialog.open() }} className={menuBtnClass}>
                <RotateCcw className="w-3.5 h-3.5" />
                {t('dashboard.actions.reset')}
              </button>
            )}
            <button role="menuitem" onClick={() => { menu.close(); customizer.open() }} className={menuBtnClass}>
              <Pencil className="w-3.5 h-3.5" />
              {t('dashboard.actions.customize')}
            </button>
            {onOpenTemplates && (
              <button role="menuitem" onClick={() => { menu.close(); onOpenTemplates() }} data-tour="templates" className={menuBtnClass}>
                <Layout className="w-3.5 h-3.5" />
                {t('dashboard.actions.templates')}
              </button>
            )}
            {onAddCard && (
              <button role="menuitem" onClick={() => { menu.close(); onAddCard() }} data-tour="add-card" className={menuBtnClass}>
                <Plus className="w-3.5 h-3.5" />
                {t('dashboard.actions.addCard')}
              </button>
            )}
          </div>
        )}

        <button
          data-tour="fab-button"
          onClick={() => { menu.toggle(); fabHint.action() }}
          className={`flex items-center justify-center rounded-full shadow-lg transition-all duration-200 ${
            isMobile ? 'w-8 h-8' : 'w-10 h-10'
          } ${
            menu.isOpen
              ? 'bg-card border border-border rotate-45'
              : 'bg-gradient-ks hover:scale-110 hover:shadow-xl'
          } ${
            fabHint.isVisible && !menu.isOpen ? 'animate-fab-shimmer' : ''
          }`}
          title={menu.isOpen ? t('dashboard.actions.closeMenu') : t('dashboard.actions.dashboardActions')}
        >
          <Plus className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-foreground`} />
        </button>
      </div>

      <ResetDialog isOpen={resetDialog.isOpen} onClose={resetDialog.close} onReset={handleReset} />
      <SidebarCustomizer isOpen={customizer.isOpen} onClose={customizer.close} />
    </>
  )
}
