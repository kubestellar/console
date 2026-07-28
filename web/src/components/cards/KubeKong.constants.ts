// Shared constants, geometry and types for the KubeKong arcade card.
// Extracted from KubeKong.tsx (issue #21614) — values unchanged.

// High-score storage key — safe wrapper tolerates private-mode
// localStorage failures (issue #8937).
export const KUBE_KONG_HIGHSCORE_KEY = 'highscore-kubeKong'

// Game constants
export const CANVAS_WIDTH = 280
export const CANVAS_HEIGHT = 320
export const GRAVITY = 0.4
export const JUMP_FORCE = -8
export const MOVE_SPEED = 2
export const BARREL_SPEED = 2.5
export const PLAYER_WIDTH = 16
export const PLAYER_HEIGHT = 24
export const BARREL_SIZE = 14
export const BOSS_FRAME_RESET_MS = 300

// Sloped platform structure - like classic DK
export interface Platform {
  x1: number  // Left x
  y1: number  // Left y
  x2: number  // Right x
  y2: number  // Right y (different for slope)
}

export interface Ladder {
  x: number
  yTop: number
  yBottom: number
}

export interface Barrel {
  x: number
  y: number
  vx: number
  vy: number
  rolling: boolean
}

export interface Player {
  x: number
  y: number
  vx: number
  vy: number
  onGround: boolean
  climbing: boolean
  facingRight: boolean
  jumpedBarrels: Set<number>
}

// Classic DK-style sloped platforms
// Staggered widths ensure barrels transition between levels:
// - Right-rolling levels (4, 2) end at x=260; the level below extends to x=270 to catch
// - Left-rolling levels (3, 1) end at x=20; the level below extends to x=10 to catch
export const PLATFORMS: Platform[] = [
  // Ground - full width flat
  { x1: 0, y1: 300, x2: 280, y2: 300 },
  // Level 1 - slopes down-left (slope < 0 → rolls LEFT, exits at x≈20)
  { x1: 20, y1: 258, x2: 270, y2: 250 },
  // Level 2 - slopes down-right (slope > 0 → rolls RIGHT, exits at x≈260)
  { x1: 10, y1: 200, x2: 260, y2: 208 },
  // Level 3 - slopes down-left (slope < 0 → rolls LEFT, exits at x≈20)
  { x1: 20, y1: 158, x2: 270, y2: 150 },
  // Level 4 - slopes down-right (slope > 0 → rolls RIGHT, exits at x≈260)
  { x1: 30, y1: 100, x2: 260, y2: 108 },
  // Top platform for princess
  { x1: 90, y1: 55, x2: 190, y2: 55 },
]

// Ladders connecting platforms
export const LADDERS: Ladder[] = [
  // Ground to Level 1
  { x: 230, yTop: 250, yBottom: 300 },
  // Level 1 to Level 2
  { x: 50, yTop: 200, yBottom: 258 },
  // Level 2 to Level 3
  { x: 230, yTop: 150, yBottom: 208 },
  // Level 3 to Level 4
  { x: 50, yTop: 100, yBottom: 158 },
  // Level 4 to Top
  { x: 140, yTop: 55, yBottom: 108 },
]

// Get Y position on a sloped platform at given X
export function getPlatformY(platform: Platform, x: number): number {
  const t = (x - platform.x1) / (platform.x2 - platform.x1)
  return platform.y1 + t * (platform.y2 - platform.y1)
}
