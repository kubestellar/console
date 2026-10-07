// Shared constants and types for the MissileCommand arcade card.
// Extracted from MissileCommand.tsx (issue #24058) — values unchanged.

// Game constants
export const CANVAS_WIDTH = 320
export const CANVAS_HEIGHT = 300
export const GROUND_Y = CANVAS_HEIGHT - 20
export const CITY_COUNT = 6
export const CITY_WIDTH = 24
export const MISSILE_BATTERY_WIDTH = 18
export const INITIAL_AMMO = 10
export const TOTAL_WAVES = 5
export const ENEMY_BASE_COUNT = 4
export const ENEMY_COUNT_INCREMENT = 2
export const ENEMY_BASE_SPEED = 0.4
export const ENEMY_SPEED_INCREMENT = 0.1
export const ENEMY_SPEED_VARIANCE = 0.2
export const PLAYER_MISSILE_SPEED = 5
export const PLAYER_EXPLOSION_RADIUS = 30
export const ENEMY_IMPACT_RADIUS = 20
export const EXPLOSION_INITIAL_RADIUS = 2
export const EXPLOSION_GROW_RATE = 1.5
export const EXPLOSION_SHRINK_RATE = 1
export const GAME_LOOP_MS = 33
export const CITY_SURVIVAL_BONUS = 50
export const MISSILE_DESTROY_POINTS = 10
export const BATTERY_AMMO_DRAIN = 3
export const BATTERY_HIT_RADIUS = 5
export const TRAIL_MAX_LENGTH = 20
export const STAR_COUNT = 40
export const LAUNCH_Y = GROUND_Y - 14

export interface City {
  x: number
  alive: boolean
}

export interface MissileBattery {
  x: number
  ammo: number
}

export interface EnemyMissile {
  id: number
  x: number
  y: number
  targetX: number
  targetY: number
  speed: number
  trail: Array<{ x: number; y: number }>
}

export interface PlayerMissile {
  id: number
  x: number
  y: number
  targetX: number
  targetY: number
  speed: number
}

export interface Explosion {
  id: number
  x: number
  y: number
  radius: number
  maxRadius: number
  growing: boolean
}

// Initial city positions (fixed layout, avoid battery positions)
export const CITY_POSITIONS = [40, 80, 120, 200, 240, 280]

// Initial battery positions (symmetric)
export const BATTERY_POSITIONS = [10, CANVAS_WIDTH / 2 - MISSILE_BATTERY_WIDTH / 2, CANVAS_WIDTH - 10 - MISSILE_BATTERY_WIDTH]

export interface MissileCommandGameState {
  cities: City[]
  batteries: MissileBattery[]
  enemyMissiles: EnemyMissile[]
  playerMissiles: PlayerMissile[]
  explosions: Explosion[]
  score: number
  wave: number
  gameOver: boolean
  cursorPos: { x: number; y: number }
}
