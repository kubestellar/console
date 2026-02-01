import { useState, useRef, useEffect } from 'react'
import { Plus, Layout, RotateCcw } from 'lucide-react'
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
  const { isMobile } = useMobile()
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

  const showResetOption = isCustomized && (onReset || onResetToDefaults)

  return (
    <>
      <div ref={menuRef} className={`fixed ${positionClasses} z-40 flex flex-col ${isMobile ? 'items-start' : 'items-end'} gap-1.5 transition-all duration-300`}>
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
