export interface Card {
  id: string
  card_type: string
  title?: string
  configuration?: Record<string, unknown>
  position?: { x: number; y: number; w: number; h: number }
  created_at?: string
  updated_at?: string
}

export interface SortableCardProps {
  card: Card
}

export interface DragPreviewCardProps {
  card: Card
}

export interface GridLayoutProps {
  children: React.ReactNode
  cols: number
  gap?: number
}

export interface CardToolbarProps {
  onAddCard: () => void
  onExport: () => void
  onImport: () => void
  isLoading?: boolean
}
