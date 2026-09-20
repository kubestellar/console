/**
 * Constants and types for the PodPitfall card game.
 */

// Canvas dimensions
export const CANVAS_WIDTH = 320
export const CANVAS_HEIGHT = 200

// Physics
export const GRAVITY = 0.4
export const JUMP_FORCE = -8
export const MOVE_SPEED = 4

// Level generation
export const PIT_OFFSET_X = 100
export const PIT_Y = 180
export const PIT_WIDTH = 120
export const NARROW_PLATFORM_WIDTH = 60
export const SCREEN_COUNT = 20
export const WIN_DISTANCE = 500
export const STARTING_TIME = 2000
export const STARTING_LIVES = 3
export const GAME_TICK_MS = 33

export interface Vine {
  x: number
  topY: number
  length: number
}

export interface Player {
  x: number
  y: number
  vx: number
  vy: number
  onGround: boolean
  swinging: boolean
  swingAngle: number
  swingVine: Vine | null
}

export interface Platform {
  x: number
  y: number
  width: number
  type: 'ground' | 'log' | 'pit'
}

export interface Obstacle {
  x: number
  y: number
  type: 'snake' | 'scorpion' | 'croc' | 'fire'
  direction: number
}

export interface Collectible {
  x: number
  y: number
  type: 'gold' | 'diamond' | 'ring-3'
  collected: boolean
}

export const STARTING_PLAYER: Player = {
  x: 50,
  y: 140,
  vx: 0,
  vy: 0,
  onGround: true,
  swinging: false,
  swingAngle: 0,
  swingVine: null,
}
