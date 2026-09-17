/**
 * DashboardHeader - title, health indicator and action buttons for
 * UnifiedDashboard.
 *
 * Extracted verbatim from UnifiedDashboard.tsx (#22979).
 */

import { RefreshCw, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '../../../../components/ui/Button'
import { DashboardHealthIndicator } from '../../../../components/dashboard/DashboardHealthIndicator'
import type { DashboardFeatures } from '../../types'

export interface DashboardHeaderProps {
  name: string
  subtitle?: string
  features: DashboardFeatures
  isLoading: boolean
  lastUpdated: Date | null
  isCustomized: boolean
  onRefresh: () => void
  onAddCard: () => void
  onResetRequest: () => void
}

export function DashboardHeader({
  name,
  subtitle,
  features,
  isLoading,
  lastUpdated,
  isCustomized,
  onRefresh,
  onAddCard,
  onResetRequest }: DashboardHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{name}</h1>
          {subtitle && (
            <div className="text-sm text-muted-foreground mt-1">{subtitle}</div>
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
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2"
            title="Refresh"
            icon={<RefreshCw
              className={cn('w-4 h-4 text-muted-foreground', isLoading && 'animate-spin')}
            />}
          />
        )}

        {/* Add card button */}
        {features.addCard !== false && (
          <Button
            variant="secondary"
            onClick={onAddCard}
            className="p-2"
            title="Add card"
            icon={<Plus className="w-4 h-4 text-muted-foreground" />}
          />
        )}

        {/* Reset button (if customized) */}
        {isCustomized && (
          <button
            onClick={onResetRequest}
            className="px-3 py-1.5 text-xs rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground transition-colors"
            title="Reset to default layout"
            aria-label="Reset to default layout"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  )
}
