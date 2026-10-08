// Shared constants and types for the KubeGalaga arcade card.
// Extracted from KubeGalaga.tsx (issue #24058) — values unchanged.

/** localStorage key for Kube Galaga high score persistence */
export const HIGH_SCORE_KEY = 'kubeGalagaHighScore'
/** Numeric base for parseInt when reading the stored high score */
export const PARSE_INT_RADIX = 10

// Game constants
export const CANVAS_WIDTH = 400
export const CANVAS_HEIGHT = 500
export const PLAYER_WIDTH = 32
export const PLAYER_HEIGHT = 24
export const BULLET_WIDTH = 4
export const BULLET_HEIGHT = 12
export const ENEMY_WIDTH = 28
export const ENEMY_HEIGHT = 20
export const ENEMY_COLS = 8
export const ENEMY_ROWS = 4
export const PLAYER_SPEED = 6
export const BULLET_SPEED = 10
export const ENEMY_BULLET_SPEED = 5

// Colors
export const COLORS = {
  background: '#0a0a1a',
  player: '#00d4aa',
  playerGlow: 'rgba(0, 212, 170, 0.3)',
  bullet: '#00ffff',
  enemy1: '#ff6b6b',
  enemy2: '#ffd93d',
  enemy3: '#6bcb77',
  enemyBullet: '#ff4444',
  star: '#ffffff' }

export type KubeGalagaGameState = 'idle' | 'playing' | 'paused' | 'gameover' | 'levelcomplete'

export interface Bullet {
  x: number
  y: number
  isEnemy: boolean
}

export interface Enemy {
  x: number
  y: number
  row: number
  alive: boolean
  diving: boolean
  diveX: number
  diveY: number
  diveAngle: number
}

export interface Star {
  x: number
  y: number
  speed: number
  size: number
}

export interface PlayerPosition {
  x: number
  y: number
}
