/**
 * DashboardEmptyState - shown when a non-tab dashboard has no cards.
 *
 * Extracted verbatim from UnifiedDashboard.tsx (#22979).
 */

import { Activity } from 'lucide-react'
import { Button } from '../../../../components/ui/Button'

export interface DashboardEmptyStateProps {
  canAddCard: boolean
  onAddCard: () => void
}

export function DashboardEmptyState({ canAddCard, onAddCard }: DashboardEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Activity className="w-12 h-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-medium text-foreground mb-2">
        No cards configured
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        Add cards to start building your dashboard
      </p>
      {canAddCard && (
        <Button
          variant="primary"
          size="lg"
          onClick={onAddCard}
        >
          Add your first card
        </Button>
      )}
    </div>
  )
}
