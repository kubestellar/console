import { useState, useRef, useEffect } from 'react'
import { Plus, Layout, RotateCcw } from 'lucide-react'
import { useMissions } from '../../hooks/useMissions'
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
}: FloatingDashboardActionsProps) {
  const { isSidebarOpen, isSidebarMinimized } = useMissions()
  const [isOpen, setIsOpen] = useState(false)
  const [showResetDialog, setShowResetDialog] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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

  // Shift button left based on mission sidebar state
  // w-[500px] = 500px (full sidebar), w-12 = 48px (minimized)
  const getRightOffset = () => {
    if (!isSidebarOpen) return 'right-6'
    if (isSidebarMinimized) return 'right-[72px]' // 48px + 24px margin
    return 'right-[536px]' // 500px + 36px margin
  }
  const rightOffset = getRightOffset()

  const handleReset = (mode: ResetMode) => {
    setShowResetDialog(false)
    if (onReset) {
      onReset(mode)
    } else if (onResetToDefaults && mode === 'replace') {
      onResetToDefaults()
    }
  }

  const showResetOption = isCustomized && (onReset || onResetToDefaults)

  return (
    <>
      <div ref={menuRef} className={`fixed bottom-20 ${rightOffset} z-40 flex flex-col items-end gap-1.5 transition-all duration-300`}>
        {/* Expanded menu items */}
        {isOpen && (
          <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150">
            {showResetOption && (
              <button
                onClick={() => { setIsOpen(false); setShowResetDialog(true) }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-card/95 hover:bg-card border border-border rounded-md shadow-md backdrop-blur-sm transition-all hover:shadow-lg whitespace-nowrap"
                title="Reset dashboard cards"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            )}
            <button
              onClick={() => { setIsOpen(false); onOpenTemplates() }}
              data-tour="templates"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-card/95 hover:bg-card border border-border rounded-md shadow-md backdrop-blur-sm transition-all hover:shadow-lg whitespace-nowrap"
              title="Browse dashboard templates"
            >
              <Layout className="w-3.5 h-3.5" />
              Templates
            </button>
            <button
              onClick={() => { setIsOpen(false); onAddCard() }}
              data-tour="add-card"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-card/95 hover:bg-card border border-border rounded-md shadow-md backdrop-blur-sm transition-all hover:shadow-lg whitespace-nowrap"
              title="Add a new card"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Card
            </button>
          </div>
        )}

        {/* FAB toggle */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center justify-center w-10 h-10 rounded-full shadow-lg transition-all duration-200 ${
            isOpen
              ? 'bg-card border border-border rotate-45'
              : 'bg-gradient-ks hover:scale-110 hover:shadow-xl'
          }`}
          title={isOpen ? 'Close menu' : 'Dashboard actions'}
        >
          <Plus className="w-5 h-5 text-foreground" />
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
