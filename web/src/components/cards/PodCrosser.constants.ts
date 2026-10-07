// Game constants
export const CANVAS_WIDTH = 280
export const CANVAS_HEIGHT = 320
export const CELL_SIZE = 32
// Grid columns: Math.floor(CANVAS_WIDTH / CELL_SIZE) = 8
export const ROWS = 10
export const PLAYER_SIZE = 24

export interface Player {
  x: number
  y: number
  targetX: number
  targetY: number
  onLog: number | null  // Index of log player is riding
  dead: boolean
  deathFrame: number
}

export interface Vehicle {
  x: number
  y: number
  width: number
  speed: number
  type: 'car' | 'truck' | 'bus'
  color: string
}

export interface Log {
  x: number
  y: number
  width: number
  speed: number
  type: 'log' | 'turtle'
  turtleDiving?: boolean
}

export interface HomeSlot {
  x: number
  filled: boolean
}

// Lane configuration
export const LANES = [
  { type: 'safe', y: 9 },      // Start
  { type: 'road', y: 8, speed: 1.5, vehicles: ['car', 'car'] },
  { type: 'road', y: 7, speed: -2, vehicles: ['truck'] },
  { type: 'road', y: 6, speed: 1.8, vehicles: ['car', 'bus'] },
  { type: 'road', y: 5, speed: -2.5, vehicles: ['car', 'car', 'car'] },
  { type: 'safe', y: 4 },      // Middle safe zone
  { type: 'water', y: 3, speed: 1.2, logs: ['log', 'log', 'turtle'] },
  { type: 'water', y: 2, speed: -1.5, logs: ['log', 'turtle', 'log'] },
  { type: 'water', y: 1, speed: 2, logs: ['turtle', 'log', 'turtle'] },
  { type: 'home', y: 0 },      // Goal
]

/** Builds the initial vehicle set for each road lane. */
export function createVehicles(): Vehicle[] {
  const newVehicles: Vehicle[] = []
  LANES.forEach(lane => {
    if (lane.type === 'road' && lane.vehicles) {
      lane.vehicles.forEach((type, i) => {
        const width = type === 'truck' ? 64 : type === 'bus' ? 80 : 40
        newVehicles.push({
          x: (i * 120) % CANVAS_WIDTH,
          y: lane.y * CELL_SIZE,
          width,
          speed: lane.speed || 1,
          type: type as Vehicle['type'],
          color: type === 'truck' ? '#8b4513' : type === 'bus' ? '#ffd700' : ['#ff4444', '#4444ff', '#44ff44'][i % 3] })
      })
    }
  })
  return newVehicles
}

/** Builds the initial logs/turtles for each water lane. */
export function createLogs(): Log[] {
  const newLogs: Log[] = []
  LANES.forEach(lane => {
    if (lane.type === 'water' && lane.logs) {
      lane.logs.forEach((type, i) => {
        const width = type === 'turtle' ? 48 : 80
        newLogs.push({
          x: (i * 100) % CANVAS_WIDTH,
          y: lane.y * CELL_SIZE,
          width,
          speed: lane.speed || 1,
          type: type as Log['type'],
          turtleDiving: false })
      })
    }
  })
  return newLogs
}

/** Builds the empty home slots at the top of the board. */
export function createHomeSlots(): HomeSlot[] {
  const slots: HomeSlot[] = []
  for (let i = 0; i < 5; i++) {
    slots.push({
      x: 10 + i * 56,
      filled: false })
  }
  return slots
}
