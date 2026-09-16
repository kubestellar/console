/**
 * PlaceholderVisualization - Placeholder rendered for custom visualization
 * types until real implementations are wired in.
 */

import { Info } from 'lucide-react'

export function PlaceholderVisualization({
  type,
  itemCount,
  columns }: {
  type: string
  itemCount: number
  columns?: number
}) {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-muted-foreground border border-dashed border-border rounded-lg m-2">
      <Info className="w-8 h-8 mb-2 text-blue-400" />
      <div className="text-sm font-medium">Visualization: {type}</div>
      <div className="text-xs mt-1">
        {itemCount} items{columns ? `, ${columns} columns` : ''}
      </div>
      <div className="text-xs mt-2 text-muted-foreground">
        (Implementation pending - PR 2/4)
      </div>
    </div>
  )
}
