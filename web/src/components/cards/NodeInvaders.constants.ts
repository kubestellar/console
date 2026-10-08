// High-score storage key — safe wrapper tolerates private-mode
// localStorage failures (issue #8936).
export const NODE_INVADERS_HIGHSCORE_KEY = 'highscore-nodeInvaders'

// Game constants
export const CANVAS_WIDTH = 300
export const CANVAS_HEIGHT = 280
export const PLAYER_WIDTH = 30
export const INVADER_ROWS = 4
export const INVADER_COLS = 8
export const INVADER_WIDTH = 24
export const INVADER_HEIGHT = 16
export const SHOOT_COOLDOWN_MS = 300
export const GAME_LOOP_INTERVAL_MS = 33
export const INVADER_MOVE_STEP = 3
export const INVADER_DROP_DISTANCE = 10
export const INVADER_SHOOT_TICK_INTERVAL = 60
export const INVADER_MIN_MOVE_TICKS = 5
export const INVADER_BASE_MOVE_TICKS = 20
export const INVADER_ALIVE_TICK_DIVISOR = 2

// ─── Canvas Colors (extracted from inline rgba strings) ─────────────────────
export const NODE_INVADERS_BG = '#0a0a1a'
export const NODE_INVADERS_STARS = '#ffffff'
export const NODE_INVADERS_SHIELD_TEAL = (alpha: number) => `rgba(0, 255, 0, ${alpha})`
export const NODE_INVADERS_SHIELD_PATTERN = (alpha: number) => `rgba(0, 200, 0, ${alpha})`
export const NODE_INVADERS_INVADER_RED = '#ff6b6b'
export const NODE_INVADERS_INVADER_YELLOW = '#ffd93d'
export const NODE_INVADERS_INVADER_GREEN = '#6bcb77'
export const NODE_INVADERS_INVADER_EYES = '#000'
export const NODE_INVADERS_PLAYER_SHIP = '#00bfff'
export const NODE_INVADERS_PLAYER_COCKPIT = '#87ceeb'
export const NODE_INVADERS_BULLET_PLAYER = '#00ff00'
export const NODE_INVADERS_BULLET_ENEMY = '#ff0000'

export interface Player {
  x: number
  lives: number
}

export interface Bullet {
  x: number
  y: number
  isPlayer: boolean
}

export interface Invader {
  x: number
  y: number
  alive: boolean
  type: number
}

export interface Shield {
  x: number
  y: number
  health: number
}

/** Builds the starting invader formation. */
export function createInvaders(): Invader[] {
  const newInvaders: Invader[] = []
  for (let row = 0; row < INVADER_ROWS; row++) {
    for (let col = 0; col < INVADER_COLS; col++) {
      newInvaders.push({
        x: 30 + col * (INVADER_WIDTH + 8),
        y: 40 + row * (INVADER_HEIGHT + 10),
        alive: true,
        type: row < 1 ? 2 : row < 2 ? 1 : 0 })
    }
  }
  return newInvaders
}

/** Builds the row of full-health shields. */
export function createShields(): Shield[] {
  const newShields: Shield[] = []
  for (let i = 0; i < 4; i++) {
    newShields.push({
      x: 35 + i * 70,
      y: 210,
      health: 4 })
  }
  return newShields
}
