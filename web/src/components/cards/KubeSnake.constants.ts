// Game constants
/** Default canvas resolution when the card is collapsed (px) */
export const DEFAULT_CANVAS_SIZE = 400
/** Internal canvas width (logical pixels for game logic) */
export const CANVAS_WIDTH = DEFAULT_CANVAS_SIZE
/** Internal canvas height (logical pixels for game logic) */
export const CANVAS_HEIGHT = DEFAULT_CANVAS_SIZE
export const GRID_SIZE = 20
/** Logical pixel size of each grid cell */
export const CELL_SIZE = CANVAS_WIDTH / GRID_SIZE
export const INITIAL_SPEED = 150 // ms per move
export const MIN_SPEED = 60
/** Vertical space reserved for stats bar and controls (px) */
export const SNAKE_CHROME_HEIGHT = 100

// Colors (Kubernetes theme)
export const COLORS = {
  background: '#0a1628',
  grid: '#1e3a5f',
  snake: '#326ce5',
  snakeHead: '#00d4aa',
  food: '#ff6b6b',
  foodGlow: 'rgba(255, 107, 107, 0.3)',
  powerUp: '#ffd700' }

export interface Point {
  x: number
  y: number
}

export type Direction = 'up' | 'down' | 'left' | 'right'
