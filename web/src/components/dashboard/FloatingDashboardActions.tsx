import { useState, useRef, useEffect } from 'react'
import { Plus, Layout, RotateCcw, Download, Upload } from 'lucide-react'
import { useMissions } from '../../hooks/useMissions'
import { useMobile } from '../../hooks/useMobile'
import { ResetMode } from '../../hooks/useDashboardReset'
import { ResetDialog } from './ResetDialog'

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
  const { isSidebarOpen, isSidebarMinimized } = useMissions()
  const { isMobile } = useMobile()
  const [isOpen, setIsOpen] = useState(false)
  const [showResetDialog, setShowResetDialog] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

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
    setShowResetDialog(false)
    if (onReset) {
      onReset(mode)
    } else if (onResetToDefaults && mode === 'replace') {
      onResetToDefaults()
    }
  }

  const handleImportClick = () => {
    setIsOpen(false)
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

  const menuBtnClass = "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-card/95 hover:bg-card border border-border rounded-md shadow-md backdrop-blur-sm transition-all hover:shadow-lg whitespace-nowrap"

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
        {isOpen && (
          <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150">
            {onImport && (
              <button
                onClick={handleImportClick}
                className={menuBtnClass}
                title="Import dashboard from JSON file"
              >
                <Upload className="w-3.5 h-3.5" />
                Import
              </button>
            )}
            {onExport && (
              <button
                onClick={() => { setIsOpen(false); onExport() }}
                className={menuBtnClass}
                title="Export dashboard as JSON file"
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </button>
            )}
            {showResetOption && (
              <button
                onClick={() => { setIsOpen(false); setShowResetDialog(true) }}
                className={menuBtnClass}
                title="Reset dashboard cards"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            )}
            <button
              onClick={() => { setIsOpen(false); onOpenTemplates() }}
              data-tour="templates"
              className={menuBtnClass}
              title="Browse dashboard templates"
            >
              <Layout className="w-3.5 h-3.5" />
              Templates
            </button>
            <button
              onClick={() => { setIsOpen(false); onAddCard() }}
              data-tour="add-card"
              className={menuBtnClass}
              title="Add a new card"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Card
            </button>
          </div>
        )}

        {/* FAB toggle - smaller on mobile */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center justify-center rounded-full shadow-lg transition-all duration-200 ${
            isMobile ? 'w-8 h-8' : 'w-10 h-10'
          } ${
            isOpen
              ? 'bg-card border border-border rotate-45'
              : 'bg-gradient-ks hover:scale-110 hover:shadow-xl'
          }`}
          title={isOpen ? 'Close menu' : 'Dashboard actions'}
        >
          <Plus className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-foreground`} />
        </button>
      </div>

      <ResetDialog
        isOpen={showResetDialog}
        onClose={() => setShowResetDialog(false)}
        onReset={handleReset}
      />
    </>
  )
}
