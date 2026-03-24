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
import { Activity, RefreshCw, Plus, ExternalLink } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { AgentIcon } from '../../../components/agent/AgentIcon'
import type {
  UnifiedDashboardProps,
  DashboardCardPlacement,
  DashboardTab,
} from '../types'
import { UnifiedStatsSection } from '../stats'
import { DashboardGrid } from './DashboardGrid'
import { DashboardHealthIndicator } from '../../../components/dashboard/DashboardHealthIndicator'
import { AddCardModal } from '../../../components/dashboard/AddCardModal'
import { ConfigureCardModal } from '../../../components/dashboard/ConfigureCardModal'
import { prefetchCardChunks } from '../../../components/cards/cardRegistry'
import { SHORT_DELAY_MS } from '../../constants/network'

/** Card suggestion type from AddCardModal */
interface CardSuggestion {
  type: string
  title: string
  description: string
  visualization: string
  config: Record<string, unknown>
}

/** Card type for ConfigureCardModal */
interface ConfigurableCard {
  id: string
  card_type: string
  config: Record<string, unknown>
  title?: string
}

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

  // Tab state (for dashboards with tabs)
  const hasTabs = (config.tabs?.length ?? 0) > 0

  // Prefetch card chunks for this dashboard so React.lazy() resolves instantly
  useEffect(() => {
    // Prefetch cards for all tabs (not just active) so tab switching is instant
    const allCards = hasTabs && config.tabs
      ? config.tabs.flatMap(t => t.cards)
      : cards
    prefetchCardChunks(allCards.map(c => c.cardType))
  }, [cards, hasTabs, config.tabs])
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    if (!config.tabs || config.tabs.length === 0) return ''
    // Default to first non-disabled tab
    const firstEnabled = config.tabs.find(t => !t.disabled)
    return firstEnabled?.id ?? config.tabs[0].id
  })

  // Get cards for the active tab (or all cards if no tabs)
  const activeCards = useMemo(() => {
    if (!hasTabs) return cards
    const activeTab = config.tabs?.find(t => t.id === activeTabId)
    return activeTab?.cards ?? []
  }, [hasTabs, cards, config.tabs, activeTabId])

  // Loading state
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Modal state
  const [isAddCardModalOpen, setIsAddCardModalOpen] = useState(false)
  const [isConfigureCardModalOpen, setIsConfigureCardModalOpen] = useState(false)
  const [cardToEdit, setCardToEdit] = useState<ConfigurableCard | null>(null)

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
  const handleConfigureCard = useCallback((cardId: string) => {
    const card = cards.find((c) => c.id === cardId)
    if (card) {
      setCardToEdit({
        id: card.id,
        card_type: card.cardType,
        config: card.config || {},
        title: card.title,
      })
      setIsConfigureCardModalOpen(true)
    }
  }, [cards])

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setIsLoading(true)
    // Simulate refresh - in real implementation this would trigger data refetch
    await new Promise((resolve) => setTimeout(resolve, SHORT_DELAY_MS))
    setLastUpdated(new Date())
    setIsLoading(false)
  }, [])

  // Handle add card
  const handleAddCard = useCallback(() => {
    setIsAddCardModalOpen(true)
  }, [])

  // Handle adding cards from AddCardModal
  const handleAddCards = useCallback((newCards: CardSuggestion[]) => {
    setCards((prev) => {
      const additions: DashboardCardPlacement[] = newCards.map((card, index) => ({
        id: `${card.type}-${Date.now()}-${index}`,
        cardType: card.type,
        title: card.title,
        config: card.config,
        position: {
          x: (prev.length + index) % 12, // Simple grid placement
          y: Math.floor((prev.length + index) / 2) * 3, // Stack rows
          w: 6, // Default width
          h: 3, // Default height
        },
      }))
      return [...prev, ...additions]
    })
    setIsAddCardModalOpen(false)
  }, [])

  // Handle saving card configuration
  const handleSaveCardConfig = useCallback((cardId: string, newConfig: Record<string, unknown>, title?: string) => {
    setCards((prev) =>
      prev.map((card) =>
        card.id === cardId
          ? {
              ...card,
              config: { ...card.config, ...newConfig },
              title: title || card.title,
            }
          : card
      )
    )
    setIsConfigureCardModalOpen(false)
    setCardToEdit(null)
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
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">{config.name}</h1>
            {config.subtitle && (
              <p className="text-sm text-muted-foreground mt-1">{config.subtitle}</p>
            )}
          </div>
          {/* Health indicator */}
          <DashboardHealthIndicator />
        </div>

        <div className="flex items-center gap-2">
          {/* Last updated indicator */}
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}

          {/* Refresh button */}
          {features.autoRefresh !== false && (
            <Button
              variant="secondary"
              onClick={handleRefresh}
              disabled={isLoading}
              className="p-2"
              title="Refresh"
              icon={<RefreshCw
                className={`w-4 h-4 text-muted-foreground ${isLoading ? 'animate-spin' : ''}`}
              />}
            />
          )}

          {/* Add card button */}
          {features.addCard !== false && (
            <Button
              variant="secondary"
              onClick={handleAddCard}
              className="p-2"
              title="Add card"
              icon={<Plus className="w-4 h-4 text-muted-foreground" />}
            />
          )}

          {/* Reset button (if customized) */}
          {isCustomized && (
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-xs rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground transition-colors"
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

      {/* Tab bar (when dashboard has tabs) */}
      {hasTabs && config.tabs && (
        <div className="flex items-center gap-1 mb-6 border-b border-border">
          {config.tabs.map((tab: DashboardTab) => (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && setActiveTabId(tab.id)}
              disabled={tab.disabled}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTabId === tab.id
                  ? 'border-purple-500 text-foreground'
                  : tab.disabled
                    ? 'border-transparent text-muted-foreground/40 cursor-not-allowed'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              {tab.icon && <AgentIcon provider={tab.icon} className="w-4 h-4" />}
              {tab.label}
              {tab.disabled && tab.installUrl && (
                <a
                  href={tab.installUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="inline-flex items-center gap-0.5 text-xs text-muted-foreground/60 hover:text-muted-foreground ml-1"
                >
                  Install <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Cards grid */}
      <DashboardGrid
        cards={hasTabs ? activeCards : cards}
        features={features}
        onReorder={features.dragDrop !== false ? handleReorder : undefined}
        onRemoveCard={handleRemoveCard}
        onConfigureCard={handleConfigureCard}
        isLoading={isLoading}
      />

      {/* Empty state */}
      {cards.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Activity className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            No cards configured
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add cards to start building your dashboard
          </p>
          {features.addCard !== false && (
            <Button
              variant="primary"
              size="lg"
              onClick={handleAddCard}
            >
              Add your first card
            </Button>
          )}
        </div>
      )}

      {/* Add Card Modal */}
      <AddCardModal
        isOpen={isAddCardModalOpen}
        onClose={() => setIsAddCardModalOpen(false)}
        onAddCards={handleAddCards}
        existingCardTypes={cards.map((c) => c.cardType)}
      />

      {/* Configure Card Modal */}
      <ConfigureCardModal
        isOpen={isConfigureCardModalOpen}
        card={cardToEdit}
        onClose={() => {
          setIsConfigureCardModalOpen(false)
          setCardToEdit(null)
        }}
        onSave={handleSaveCardConfig}
      />
    </div>
  )
}

export default UnifiedDashboard
