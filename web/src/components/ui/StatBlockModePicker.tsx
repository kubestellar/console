import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Settings, Hash, TrendingUp, CircleDot, BarChart3, ArrowUpDown, Layers } from 'lucide-react'
import { Button } from './Button'
import type { StatDisplayMode } from './StatsBlockDefinitions'
import { useEscapeLayer, useModalState } from '../../lib/modals'

/** Gap between trigger button and popover in pixels */
const POPOVER_GAP_PX = 4
/** Popover width in pixels */
const POPOVER_WIDTH_PX = 160
/** Minimum spacing from the viewport edge in pixels */
const VIEWPORT_PADDING_PX = 8
const MODE_MENU_ITEM_SELECTOR = 'button[role="menuitem"]:not([disabled])'

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

/** Horseshoe icon — U-shaped arc */
function HorseshoeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M5 8a7 7 0 0 1 14 0v5" />
      <path d="M5 8v5" />
    </svg>
  )
}

/** Heatmap icon — grid of squares */
function HeatmapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="3" y="3" width="7" height="7" rx="1" opacity="0.3" />
      <rect x="14" y="3" width="7" height="7" rx="1" opacity="0.6" />
      <rect x="3" y="14" width="7" height="7" rx="1" opacity="0.8" />
      <rect x="14" y="14" width="7" height="7" rx="1" opacity="1" />
    </svg>
  )
}

const MODE_OPTIONS: { mode: StatDisplayMode; icon: React.ComponentType<{ className?: string }>; labelKey: string; defaultLabel: string }[] = [
  { mode: 'numeric', icon: Hash, labelKey: 'statsOverview.modePicker.options.numeric', defaultLabel: 'Number' },
  { mode: 'sparkline', icon: TrendingUp, labelKey: 'statsOverview.modePicker.options.sparkline', defaultLabel: 'Sparkline' },
  { mode: 'gauge', icon: GaugeIcon, labelKey: 'statsOverview.modePicker.options.gauge', defaultLabel: 'Gauge' },
  { mode: 'horseshoe', icon: HorseshoeIcon, labelKey: 'statsOverview.modePicker.options.horseshoe', defaultLabel: 'Horseshoe' },
  { mode: 'ring-3', icon: CircleDot, labelKey: 'statsOverview.modePicker.options.ring', defaultLabel: 'Ring' },
  { mode: 'mini-bar', icon: BarChart3, labelKey: 'statsOverview.modePicker.options.bar', defaultLabel: 'Bar' },
  { mode: 'trend', icon: ArrowUpDown, labelKey: 'statsOverview.modePicker.options.trend', defaultLabel: 'Trend' },
  { mode: 'stacked-bar', icon: Layers, labelKey: 'statsOverview.modePicker.options.stacked', defaultLabel: 'Stacked' },
  { mode: 'heatmap', icon: HeatmapIcon, labelKey: 'statsOverview.modePicker.options.heatmap', defaultLabel: 'Heatmap' },
]

interface StatBlockModePickerProps {
  currentMode: StatDisplayMode
  availableModes: StatDisplayMode[]
  onModeChange: (mode: StatDisplayMode) => void
}

export function StatBlockModePicker({ currentMode, availableModes, onModeChange }: StatBlockModePickerProps) {
  const { t } = useTranslation()
  const { isOpen, close, toggle } = useModalState()
  const isTopEscapeLayer = useEscapeLayer(isOpen)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPosition({
      top: rect.bottom + POPOVER_GAP_PX,
      left: Math.max(
        Math.min(rect.right - POPOVER_WIDTH_PX, window.innerWidth - POPOVER_WIDTH_PX - VIEWPORT_PADDING_PX),
        VIEWPORT_PADDING_PX,
      ),
    })
  }, [])

  const getFocusableMenuItems = useCallback(() => Array.from(
    popoverRef.current?.querySelectorAll<HTMLButtonElement>(MODE_MENU_ITEM_SELECTOR) ?? [],
  ), [])

  const focusMenuItem = useCallback((modeToFocus: StatDisplayMode) => {
    const focusableItems = getFocusableMenuItems()
    const nextFocusedItem = focusableItems.find((item) => item.dataset.mode === modeToFocus) ?? focusableItems[0]
    nextFocusedItem?.focus()
  }, [getFocusableMenuItems])

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isOpen) updatePosition()
    toggle()
  }

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return

    e.preventDefault()
    e.stopPropagation()

    if (!isOpen) {
      updatePosition()
      toggle()
      return
    }

    focusMenuItem(currentMode)
  }

  const handleSelect = (e: React.MouseEvent<HTMLButtonElement>, mode: StatDisplayMode) => {
    e.stopPropagation()
    e.preventDefault()
    onModeChange(mode)
    close()
    triggerRef.current?.focus()
  }

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return

    e.preventDefault()
    const focusableItems = getFocusableMenuItems()
    if (!focusableItems.length) return

    const currentIndex = focusableItems.findIndex((item) => item === document.activeElement)
    if (currentIndex === -1) {
      focusMenuItem(currentMode)
      return
    }

    const direction = e.key === 'ArrowDown' ? 1 : -1
    const nextIndex = (currentIndex + direction + focusableItems.length) % focusableItems.length
    focusableItems[nextIndex]?.focus()
  }

  // Reposition on scroll/resize while open
  useEffect(() => {
    if (!isOpen) return

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, { capture: true, passive: true })

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, { capture: true })
    }
  }, [isOpen, updatePosition])

  // Focus current mode when menu opens
  useEffect(() => {
    if (!isOpen) return
    focusMenuItem(currentMode)
  }, [currentMode, focusMenuItem, isOpen])

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        close()
      }
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !isTopEscapeLayer()) return
      e.preventDefault()
      e.stopPropagation()
      close()
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen, close, isTopEscapeLayer])

  const availableSet = new Set(availableModes)

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="sm"
        icon={<Settings className="w-3 h-3" />}
        onClick={handleToggle}
        onKeyDown={handleTriggerKeyDown}
        title={t('statsOverview.modePicker.changeDisplayMode', { defaultValue: 'Change display mode' })}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="absolute top-1.5 right-1.5 p-1 opacity-0 group-hover:opacity-100 transition-all z-10"
      />
      {isOpen && createPortal(
        <div
          ref={popoverRef}
          role="menu"
          aria-label={t('statsOverview.modePicker.displayMode', { defaultValue: 'Display mode' })}
          className="fixed z-dropdown bg-card border border-border rounded-lg shadow-xl p-1.5 animate-in fade-in zoom-in-95 duration-150"
          style={{ top: position.top, left: position.left, width: POPOVER_WIDTH_PX }}
          onKeyDown={handleMenuKeyDown}
        >
          <div className="text-2xs text-muted-foreground px-2 py-1 font-medium uppercase tracking-wider">
            {t('statsOverview.modePicker.displayMode', { defaultValue: 'Display mode' })}
          </div>
          {MODE_OPTIONS.map(({ mode, icon: Icon, labelKey, defaultLabel }) => {
            const isAvailable = availableSet.has(mode)
            const isActive = mode === currentMode
            return (
              <button
                key={mode}
                role="menuitem"
                data-mode={mode}
                onClick={(e) => isAvailable && handleSelect(e, mode)}
                disabled={!isAvailable}
                className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-xs transition-colors ${
                  isActive
                    ? 'bg-purple-500/20 text-purple-400'
                    : isAvailable
                      ? 'text-foreground hover:bg-secondary'
                      : 'text-muted-foreground/40 cursor-not-allowed'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{t(labelKey, { defaultValue: defaultLabel })}</span>
                {isActive && <span className="ml-auto text-purple-400" aria-hidden="true">&#x2713;</span>}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}
