import { useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Layout, RotateCcw, Download, Upload, Pencil } from 'lucide-react'
import { useModalState } from '../../lib/modals'
import { useMissions } from '../../hooks/useMissions'
import { useMobile } from '../../hooks/useMobile'
import { ResetMode } from '../../hooks/useDashboardReset'
import { ResetDialog } from './ResetDialog'
import { SidebarCustomizer } from '../layout/SidebarCustomizer'

interface FloatingDashboardActionsProps {
  onAddCard: () => void
  onOpenTemplates: () => void
  /** Callback for reset with mode selection */
  onReset?: (mode: ResetMode) => number
  /** Legacy: callback to reset dashboard to default cards (replace mode only) */
  onResetToDefaults?: () => void
  /** Whether the dashboard has been customized from defaults */
  isCustomized?: boolean
  /** Export current dashboard as JSON file */
  onExport?: () => void
  /** Import a dashboard from JSON file */
  onImport?: (json: unknown) => void
}

/**
 * Floating "+" button that expands into a menu with Add Card, Templates, and Reset.
 * Shifts left when mission sidebar is open to avoid overlap.
 */
export function FloatingDashboardActions({
  onAddCard,
  onOpenTemplates,
  onReset,
  onResetToDefaults,
  isCustomized,
  onExport,
  onImport,
}: FloatingDashboardActionsProps) {
  const { t } = useTranslation()
  const { isSidebarOpen, isSidebarMinimized } = useMissions()
  const { isMobile } = useMobile()
  const menu = useModalState()
  const resetDialog = useModalState()
  const customizer = useModalState()
  const menuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { isOpen: menuIsOpen, close: closeMenu } = menu

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuIsOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu()
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMenu()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [menuIsOpen, closeMenu])

  // Desktop: shift button left based on mission sidebar state
  // Mobile: always bottom left
  const getPositionClasses = () => {
    if (isMobile) return 'left-4 bottom-4'
    // Desktop: right side, shifts when sidebar open
    if (!isSidebarOpen) return 'right-6 bottom-20'
    if (isSidebarMinimized) return 'right-[72px] bottom-20' // 48px + 24px margin
    return 'right-[536px] bottom-20' // 500px + 36px margin
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

  const handleImportClick = () => {
    menu.close()
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !onImport) return
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      onImport(json)
    } catch {
      // Invalid JSON — ignore
    }
    // Reset input so the same file can be re-selected
    e.target.value = ''
  }

  const showResetOption = isCustomized && (onReset || onResetToDefaults)

  const menuBtnClass = "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-card hover:bg-secondary border border-border rounded-md shadow-md transition-all hover:shadow-lg whitespace-nowrap"

  return (
    <>
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
      />

      <div ref={menuRef} className={`fixed ${positionClasses} z-40 flex flex-col ${isMobile ? 'items-start' : 'items-end'} gap-1.5 transition-all duration-300`}>
        {/* Expanded menu items */}
        {menu.isOpen && (
          <div
            role="menu"
            className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150"
            onKeyDown={(e) => {
              if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
              e.preventDefault()
              const items = e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')
              const idx = Array.from(items).indexOf(document.activeElement as HTMLElement)
              if (e.key === 'ArrowDown') items[Math.min(idx + 1, items.length - 1)]?.focus()
              else items[Math.max(idx - 1, 0)]?.focus()
            }}
          >
            {onImport && (
              <button
                role="menuitem"
                onClick={handleImportClick}
                className={menuBtnClass}
                title={t('dashboard.actions.importTitle')}
              >
                <Upload className="w-3.5 h-3.5" />
                {t('dashboard.actions.import')}
              </button>
            )}
            {onExport && (
              <button
                role="menuitem"
                onClick={() => { menu.close(); onExport() }}
                className={menuBtnClass}
                title={t('dashboard.actions.exportTitle')}
              >
                <Download className="w-3.5 h-3.5" />
                {t('dashboard.actions.export')}
              </button>
            )}
            {showResetOption && (
              <button
                role="menuitem"
                onClick={() => { menu.close(); resetDialog.open() }}
                className={menuBtnClass}
                title={t('dashboard.actions.resetTitle')}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {t('dashboard.actions.reset')}
              </button>
            )}
            <button
                role="menuitem"
                onClick={() => { menu.close(); customizer.open() }}
              className={menuBtnClass}
              title={t('dashboard.actions.customizeTitle')}
            >
              <Pencil className="w-3.5 h-3.5" />
              {t('dashboard.actions.customize')}
            </button>
            <button
                role="menuitem"
                onClick={() => { menu.close(); onOpenTemplates() }}
              data-tour="templates"
              className={menuBtnClass}
              title={t('dashboard.actions.templatesTitle')}
            >
              <Layout className="w-3.5 h-3.5" />
              {t('dashboard.actions.templates')}
            </button>
            <button
                role="menuitem"
                onClick={() => { menu.close(); onAddCard() }}
              data-tour="add-card"
              className={menuBtnClass}
              title={t('dashboard.actions.addCardTitle')}
            >
              <Plus className="w-3.5 h-3.5" />
              {t('dashboard.actions.addCard')}
            </button>
          </div>
        )}

        {/* FAB toggle - smaller on mobile */}
        <button
          onClick={menu.toggle}
          className={`flex items-center justify-center rounded-full shadow-lg transition-all duration-200 ${
            isMobile ? 'w-8 h-8' : 'w-10 h-10'
          } ${
            menu.isOpen
              ? 'bg-card border border-border rotate-45'
              : 'bg-gradient-ks hover:scale-110 hover:shadow-xl'
          }`}
          title={menu.isOpen ? t('dashboard.actions.closeMenu') : t('dashboard.actions.dashboardActions')}
        >
          <Plus className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-foreground`} />
        </button>
      </div>

      <ResetDialog
        isOpen={resetDialog.isOpen}
        onClose={resetDialog.close}
        onReset={handleReset}
      />

      <SidebarCustomizer
        isOpen={customizer.isOpen}
        onClose={customizer.close}
      />
    </>
  )
}
