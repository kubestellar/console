// Game constants
export const CANVAS_WIDTH = 480
export const CANVAS_HEIGHT = 320
export const TILE_SIZE = 32
export const GRAVITY = 0.5
export const JUMP_FORCE = -12
export const MOVE_SPEED = 4
export const PLAYER_SIZE = 28
/** Number of frames of invincibility after spawning (prevents instant death at start) */
export const INVINCIBILITY_FRAMES = 90

// Tile types
export const EMPTY = 0
export const BRICK = 1
export const QUESTION = 2
export const GROUND = 3
export const PIPE = 4
export const COIN = 5
export const GOOMBA = 6
export const FLAG = 7

// Colors
export const COLORS = {
  sky: '#5c94fc',
  brick: '#b85820',
  question: '#ffa000',
  ground: '#8b4513',
  pipe: '#00a000',
  coin: '#ffd700',
  player: '#ff6b35',
  goomba: '#8b4513',
  flag: '#00ff00' }

// Level data (15 columns x 10 rows)
export const LEVEL_DATA = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7],
  [0, 0, 0, 0, 2, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0],
  [0, 0, 0, 6, 0, 6, 0, 0, 0, 0, 0, 0, 0, 4, 4],
  [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
]

export interface Player {
  x: number
  y: number
  vx: number
  vy: number
  onGround: boolean
  facingRight: boolean
}

export interface Enemy {
  x: number
  y: number
  vx: number
  type: number
  alive: boolean
}

export interface Coin {
  x: number
  y: number
  collected: boolean
}

// High-score storage key — safeGet/safeSet tolerate private-mode
// browsers where localStorage access throws (issue #8938).
export const POD_BROTHERS_HIGHSCORE_KEY = 'podBrothersHighScore'
