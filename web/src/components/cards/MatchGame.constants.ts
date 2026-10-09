import {
  Box, Container, Database, Server, Cloud, Network, HardDrive,
  Cpu, Lock, Shield, Globe, GitBranch,
} from 'lucide-react'

// Kubernetes/Cloud themed icons for matching
export const CARD_ICONS = [
  { id: 'pod', Icon: Box, color: 'text-blue-400' },
  { id: 'container', Icon: Container, color: 'text-purple-400' },
  { id: 'database', Icon: Database, color: 'text-green-400' },
  { id: 'server', Icon: Server, color: 'text-yellow-400' },
  { id: 'cloud', Icon: Cloud, color: 'text-cyan-400' },
  { id: 'network', Icon: Network, color: 'text-purple-400' },
  { id: 'storage', Icon: HardDrive, color: 'text-orange-400' },
  { id: 'cpu', Icon: Cpu, color: 'text-red-400' },
  { id: 'security', Icon: Lock, color: 'text-blue-400' },
  { id: 'shield', Icon: Shield, color: 'text-cyan-400' },
  { id: 'globe', Icon: Globe, color: 'text-green-400' },
  { id: 'git', Icon: GitBranch, color: 'text-purple-400' },
]

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface GameCard {
  id: string
  iconId: string
  matched: boolean
}

export interface HighScore {
  difficulty: Difficulty
  moves: number
  time: number
  date: string
}

export const DIFFICULTY_CONFIG = {
  easy: { rows: 3, cols: 4, pairs: 6 },
  medium: { rows: 4, cols: 4, pairs: 8 },
  hard: { rows: 4, cols: 6, pairs: 12 } }

export const TIMER_TICK_MS = 1_000
export const MATCH_REVEAL_DELAY_MS = 500
export const NO_MATCH_FLIP_DELAY_MS = 1_000
export const CONFETTI_DURATION_MS = 5_000
