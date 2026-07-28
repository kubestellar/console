export interface Card {
  id: string
  card_type: string
  config: Record<string, unknown>
  position: { x: number; y: number; w: number; h: number }
  title?: string
}
