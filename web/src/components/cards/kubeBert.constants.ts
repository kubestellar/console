/**
 * Constants and types for the KubeBert card game.
 */
import {
  KUBEBERT_TILE_UNVISITED, KUBEBERT_TILE_VISITED, KUBEBERT_TILE_TARGET,
  KUBEBERT_PLAYER, KUBEBERT_ENEMY_COILY, KUBEBERT_ENEMY_BALL, KUBEBERT_BG,
} from '../../lib/theme/chartColors'

// ─── Game Constants ───────────────────────────────────────────────────────────
export const PYRAMID_ROWS = 7
export const INITIAL_LIVES = 3
export const POINTS_PER_TILE = 25
export const BONUS_PER_LEVEL = 500
export const ENEMY_SPAWN_INTERVAL_MS = 3000
export const ENEMY_MOVE_INTERVAL_MS = 800
export const PLAYER_MOVE_COOLDOWN_MS = 200
/** Delay in milliseconds before starting the next level after completing the current one */
export const LEVEL_TRANSITION_DELAY_MS = 1000
/** Minimum enemy spawn interval in milliseconds — prevents the game from becoming unplayable at high levels */
export const MIN_ENEMY_SPAWN_INTERVAL_MS = 1000

// ─── Canvas Colors (extracted from inline rgba/rgb strings) ─────────────────
export const KUBEBERT_TILE_STROKE = 'rgba(255,255,255,0.15)'
export const KUBEBERT_FACE_SHADOW = 'rgba(0,0,0,0.2)'
export const KUBEBERT_CHARACTER_OUTLINE = 'rgba(0,0,0,0.3)'
export const KUBEBERT_LABEL_TEXT = 'rgba(255,255,255,0.6)'
export const KUBEBERT_LEVEL_COMPLETE_FLASH = 'rgba(0, 212, 170, 0.15)'
export const KUBEBERT_LEVEL_COMPLETE_TEXT = '#00d4aa'
export const KUBEBERT_CHARACTER_EYES = '#000'
export const KUBEBERT_CHARACTER_NOSE = '#ff8800'
export const KUBEBERT_CHARACTER_CROWN_BG = '#326ce5'
export const KUBEBERT_CHARACTER_CROWN_OUTLINE = '#fff'
export const KUBEBERT_GAMEOVER_TEXT = '#fff'

// Tile colors by state
export const TILE_COLORS = {
  unvisited: KUBEBERT_TILE_UNVISITED,     // dark blue
  visited: KUBEBERT_TILE_VISITED,         // Kubernetes blue
  target: KUBEBERT_TILE_TARGET,           // bright green (level target color)
}

export const PLAYER_COLOR = KUBEBERT_PLAYER          // gold — the Kube Bert character
export const ENEMY_COILY_COLOR = KUBEBERT_ENEMY_COILY  // red snake enemy
export const ENEMY_BALL_COLOR = KUBEBERT_ENEMY_BALL    // orange bouncing ball
export const BG_COLOR = KUBEBERT_BG

// Kubernetes-themed labels for tiles
export const KUBE_LABELS = ['Pod', 'Svc', 'Node', 'NS', 'Dep', 'RS', 'DS', 'Job', 'CRD', 'PV', 'CM', 'Sec', 'Ing', 'HPA', 'SA']

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Position {
  row: number
  col: number
}

export interface Enemy {
  pos: Position
  type: 'coily' | 'ball'
  id: number
}

export type GameState = 'idle' | 'playing' | 'gameover' | 'levelComplete'
