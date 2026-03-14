import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Settings, Hash, TrendingUp, CircleDot, BarChart3 } from 'lucide-react'
import type { StatDisplayMode } from './StatsBlockDefinitions'

/** Gap between trigger button and popover in pixels */
const POPOVER_GAP_PX = 4

/** Gauge icon — custom SVG since Lucide doesn't have a half-arc gauge */
function GaugeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 16.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z" opacity="0" />
      <path d="M5.63 7.63A7 7 0 0 1 19 12" />
      <path d="M12 12l-2.5-4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

const MODE_OPTIONS: { mode: StatDisplayMode; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { mode: 'numeric', icon: Hash, label: 'Number' },
  { mode: 'sparkline', icon: TrendingUp, label: 'Sparkline' },
  { mode: 'gauge', icon: GaugeIcon, label: 'Gauge' },
  { mode: 'ring', icon: CircleDot, label: 'Ring' },
  { mode: 'mini-bar', icon: BarChart3, label: 'Bar' },
]

interface StatBlockModePickerProps {
  currentMode: StatDisplayMode
  availableModes: StatDisplayMode[]
  onModeChange: (mode: StatDisplayMode) => void
}

export function StatBlockModePicker({ currentMode, availableModes, onModeChange }: StatBlockModePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPosition({
      top: rect.bottom + POPOVER_GAP_PX,
      left: Math.max(rect.right - 160, 8), // Right-align, keep on screen
    })
  }, [])

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isOpen) updatePosition()
    setIsOpen(!isOpen)
  }

  const handleSelect = (mode: StatDisplayMode) => {
    onModeChange(mode)
    setIsOpen(false)
  }

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen])

  const availableSet = new Set(availableModes)

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className="absolute top-1.5 right-1.5 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-all z-10"
        title="Change display mode"
        aria-label="Change display mode"
      >
        <Settings className="w-3 h-3" />
      </button>
      {isOpen && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[100] bg-card border border-border rounded-lg shadow-xl p-1.5 animate-in fade-in zoom-in-95 duration-150"
          style={{ top: position.top, left: position.left, width: 160 }}
        >
          <div className="text-2xs text-muted-foreground px-2 py-1 font-medium uppercase tracking-wider">
            Display Mode
          </div>
          {MODE_OPTIONS.map(({ mode, icon: Icon, label }) => {
            const isAvailable = availableSet.has(mode)
            const isActive = mode === currentMode
            return (
              <button
                key={mode}
                onClick={() => isAvailable && handleSelect(mode)}
                disabled={!isAvailable}
                className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-xs transition-colors ${
                  isActive
                    ? 'bg-purple-500/20 text-purple-400'
                    : isAvailable
                      ? 'text-foreground hover:bg-secondary'
                      : 'text-muted-foreground/40 cursor-not-allowed'
                }`}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{label}</span>
                {isActive && <span className="ml-auto text-purple-400">&#x2713;</span>}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}
