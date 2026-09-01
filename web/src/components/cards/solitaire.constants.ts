import { Box, Server, Database, Cpu } from 'lucide-react'

export type Suit = 'pods' | 'containers' | 'clusters' | 'nodes'
export type CardValue = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'
export type CardSize = 'small' | 'medium' | 'large'

export interface PlayingCard {
  id: string
  suit: Suit
  value: CardValue
  faceUp: boolean
}

export interface GameState {
  stock: PlayingCard[]
  waste: PlayingCard[]
  foundations: PlayingCard[][]
  tableau: PlayingCard[][]
}

export interface HighScore {
  moves: number
  time: number
  date: string
}

export const SUITS: Suit[] = ['pods', 'containers', 'clusters', 'nodes']
export const VALUES: CardValue[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

export const TIMER_TICK_MS = 1000
export const MAX_UNDO_HISTORY = 19
export const SOLITAIRE_HIGH_SCORE_KEY = 'solitaire-high-score'

export const SUIT_CONFIG: Record<Suit, { Icon: typeof Box; color: string; isRed: boolean }> = {
  pods: { Icon: Box, color: 'text-blue-400', isRed: true },
  containers: { Icon: Database, color: 'text-green-400', isRed: true },
  clusters: { Icon: Server, color: 'text-orange-400', isRed: false },
  nodes: { Icon: Cpu, color: 'text-purple-400', isRed: false },
}

export const CARD_SIZES: Record<CardSize, { w: number; h: number; text: string; icon: string; centerIcon: string; overlap: number }> = {
  small:  { w: 32,  h: 44,  text: 'text-[8px]', icon: 'w-2 h-2', centerIcon: 'w-4 h-4', overlap: -32 },
  medium: { w: 56,  h: 77,  text: 'text-xs',    icon: 'w-3 h-3', centerIcon: 'w-6 h-6', overlap: -56 },
  large:  { w: 80,  h: 110, text: 'text-sm',    icon: 'w-4 h-4', centerIcon: 'w-8 h-8', overlap: -80 },
}
