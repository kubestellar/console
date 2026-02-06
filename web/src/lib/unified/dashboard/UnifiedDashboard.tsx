/**
 * UnifiedDashboard - Single component that renders any dashboard from config
 *
 * This component accepts a UnifiedDashboardConfig and renders a complete
 * dashboard with stats, cards, and optional features like drag-drop and
 * card management.
 *
 * Usage:
 *   <UnifiedDashboard config={mainDashboardConfig} />
 */

import { useState, useCallback, useMemo, useEffect } from 'react'
import { Activity, RefreshCw, Plus } from 'lucide-react'
import type {
  UnifiedDashboardProps,
  DashboardCardPlacement,
} from '../types'
import { UnifiedStatsSection } from '../stats'
import { DashboardGrid } from './DashboardGrid'

/**
 * UnifiedDashboard - Renders a complete dashboard from config
 */
export function UnifiedDashboard({
  config,
  statsData,
  className = '',
}: UnifiedDashboardProps) {
  // Card state - load from localStorage or use config defaults
  const [cards, setCards] = useState<DashboardCardPlacement[]>(() => {
    if (config.storageKey) {
      try {
        const stored = localStorage.getItem(config.storageKey)
        if (stored) {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
    return config.cards
  })

  // Loading state
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Persist cards to localStorage when they change
  useEffect(() => {
    if (config.storageKey && cards.length > 0) {
      try {
        localStorage.setItem(config.storageKey, JSON.stringify(cards))
      } catch {
        // Ignore storage errors
      }
    }
  }, [cards, config.storageKey])

  // Handle card reorder
  const handleReorder = useCallback((newCards: DashboardCardPlacement[]) => {
    setCards(newCards)
  }, [])

  // Handle card removal
  const handleRemoveCard = useCallback((cardId: string) => {
    setCards((prev) => prev.filter((c) => c.id !== cardId))
  }, [])

  // Handle card configuration
  const handleConfigureCard = useCallback((_cardId: string) => {
    // TODO: Open configuration modal
  }, [])

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setIsLoading(true)
    // Simulate refresh - in real implementation this would trigger data refetch
    await new Promise((resolve) => setTimeout(resolve, 500))
    setLastUpdated(new Date())
    setIsLoading(false)
  }, [])

  // Handle add card
  const handleAddCard = useCallback(() => {
    // TODO: Open add card modal
  }, [])

  // Handle reset to defaults
  const handleReset = useCallback(() => {
    setCards(config.cards)
    if (config.storageKey) {
      try {
        localStorage.removeItem(config.storageKey)
      } catch {
        // Ignore storage errors
      }
    }
  }, [config.cards, config.storageKey])

  // Check if customized (different from defaults)
  const isCustomized = useMemo(() => {
    if (cards.length !== config.cards.length) return true
    return cards.some((card, i) => {
      const defaultCard = config.cards[i]
      return (
        card.id !== defaultCard?.id ||
        card.cardType !== defaultCard?.cardType ||
        card.position.w !== defaultCard?.position.w ||
        card.position.h !== defaultCard?.position.h
      )
    })
  }, [cards, config.cards])

  // Features with defaults
  const features = config.features || {}

  return (
    <div className={`p-4 md:p-6 ${className}`}>
      {/* Dashboard header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{config.name}</h1>
          {config.subtitle && (
            <p className="text-sm text-gray-400 mt-1">{config.subtitle}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Last updated indicator */}
          {lastUpdated && (
            <span className="text-xs text-gray-500">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}

          {/* Refresh button */}
          {features.autoRefresh !== false && (
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 transition-colors"
              title="Refresh"
            >
              <RefreshCw
                className={`w-4 h-4 text-gray-400 ${isLoading ? 'animate-spin' : ''}`}
              />
            </button>
          )}

          {/* Add card button */}
          {features.addCard !== false && (
            <button
              onClick={handleAddCard}
              className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
              title="Add card"
            >
              <Plus className="w-4 h-4 text-gray-400" />
            </button>
          )}

          {/* Reset button (if customized) */}
          {isCustomized && (
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors"
              title="Reset to default layout"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Stats section */}
      {config.stats && (
        <UnifiedStatsSection
          config={config.stats}
          data={statsData}
          hasData={!!statsData}
          isLoading={isLoading}
          lastUpdated={lastUpdated}
          className="mb-6"
        />
      )}

      {/* Cards grid */}
      <DashboardGrid
        cards={cards}
        features={features}
        onReorder={features.dragDrop !== false ? handleReorder : undefined}
        onRemoveCard={handleRemoveCard}
        onConfigureCard={handleConfigureCard}
        isLoading={isLoading}
      />

      {/* Empty state */}
      {cards.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Activity className="w-12 h-12 text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-300 mb-2">
            No cards configured
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Add cards to start building your dashboard
          </p>
          {features.addCard !== false && (
            <button
              onClick={handleAddCard}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
            >
              Add your first card
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default UnifiedDashboard
