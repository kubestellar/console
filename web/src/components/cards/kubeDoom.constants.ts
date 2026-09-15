/**
 * Constants, map data, and types for the KubeDoom card game.
 */

// Canvas dimensions
export const CANVAS_WIDTH = 480
export const CANVAS_HEIGHT = 360

// Map dimensions (grid)
export const MAP_WIDTH = 16
export const MAP_HEIGHT = 16

// Raycasting constants
export const FOV = Math.PI / 3 // 60 degrees
export const NUM_RAYS = CANVAS_WIDTH
export const MAX_DEPTH = 16
export const HALF_FOV = FOV / 2

// Player constants
export const MOVE_SPEED = 0.06
export const ROTATE_SPEED = 0.04

// Colors
export const WALL_COLORS = ['#8b0000', '#006400', '#00008b', '#8b8b00']
export const CEILING_COLOR = '#1a1a2e'
export const FLOOR_COLOR = '#2d2d2d'
export const CROSSHAIR_COLOR = '#00ff00'
export const FLASH_SHOOT_COLOR = [255, 200, 50]
export const FLASH_DAMAGE_COLOR = [255, 0, 0]
export const ENEMY_EYE_RGB = [255, 50, 50]

// Map: 1-4 = walls of different colors, 0 = empty
export const MAP_DATA = [
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
  1, 0, 2, 2, 0, 0, 0, 0, 0, 0, 3, 3, 0, 0, 0, 1,
  1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 1,
  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 1,
  1, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 0, 4, 0, 1,
  1, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
  1, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 1,
  1, 0, 3, 0, 0, 0, 0, 0, 3, 3, 3, 0, 0, 0, 0, 1,
  1, 0, 3, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 2, 0, 1,
  1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 1,
  1, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 4, 0, 0, 0, 1,
  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 1,
  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
]

export function getMap(x: number, y: number): number {
  if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return 1
  return MAP_DATA[Math.floor(y) * MAP_WIDTH + Math.floor(x)]
}

// Enemy types themed as rogue Kubernetes resources
export const ENEMY_NAMES = ['CrashPod', 'OOMKiller', 'RunawayJob', 'ZombieDeploy']

export interface Enemy {
  x: number
  y: number
  alive: boolean
  health: number
  type: number
  hitTimer: number
}

export function spawnEnemies(level: number): Enemy[] {
  const enemies: Enemy[] = []
  const count = Math.min(4 + level * 2, 12)
  // Predefined valid spawn points (open areas on the map)
  const spawnPoints = [
    { x: 3.5, y: 7.5 }, { x: 7.5, y: 3.5 }, { x: 12.5, y: 3.5 },
    { x: 7.5, y: 7.5 }, { x: 12.5, y: 7.5 }, { x: 3.5, y: 12.5 },
    { x: 7.5, y: 12.5 }, { x: 12.5, y: 12.5 }, { x: 5.5, y: 9.5 },
    { x: 10.5, y: 5.5 }, { x: 9.5, y: 11.5 }, { x: 6.5, y: 4.5 },
  ]
  for (let i = 0; i < count && i < spawnPoints.length; i++) {
    enemies.push({
      x: spawnPoints[i].x,
      y: spawnPoints[i].y,
      alive: true,
      health: 1 + Math.floor(level / 3),
      type: i % ENEMY_NAMES.length,
      hitTimer: 0 })
  }
  return enemies
}

// High-score key — safeGet/safeSet tolerate private-mode localStorage throws.
export const KUBE_DOOM_HIGHSCORE_KEY = 'kubeDoomHighScore'

// Visual warning threshold for the ammo HUD readout.
export const LOW_AMMO_THRESHOLD = 5

export type KubeDoomGameState = 'idle' | 'playing' | 'paused' | 'gameover' | 'levelcomplete'

export interface Player {
  x: number
  y: number
  angle: number
}
