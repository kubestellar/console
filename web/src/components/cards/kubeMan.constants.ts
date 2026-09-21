/**
 * Constants, types, and maze helpers for the KubeMan card game.
 */

// Game constants
export const CELL_SIZE = 16
export const MAZE_WIDTH = 19
export const MAZE_HEIGHT = 21
export const POWER_MODE_DURATION_MS = 5000

// Ghost names and behaviors
export type GhostName = 'Blinky' | 'Pinky' | 'Inky' | 'Clyde'

// Maze layout: 0=wall, 1=dot, 2=power pellet, 3=empty, 4=ghost house
export const MAZE_TEMPLATE = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,0],
  [0,2,0,0,1,0,0,0,1,0,1,0,0,0,1,0,0,2,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,0,0,1,0,1,0,0,0,0,0,1,0,1,0,0,1,0],
  [0,1,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,1,0],
  [0,0,0,0,1,0,0,0,1,0,1,0,0,0,1,0,0,0,0],
  [3,3,3,0,1,0,1,1,1,1,1,1,1,0,1,0,3,3,3],
  [0,0,0,0,1,0,1,0,0,4,0,0,1,0,1,0,0,0,0],
  [3,3,3,3,1,1,1,0,4,4,4,0,1,1,1,3,3,3,3],
  [0,0,0,0,1,0,1,0,0,0,0,0,1,0,1,0,0,0,0],
  [3,3,3,0,1,0,1,1,1,1,1,1,1,0,1,0,3,3,3],
  [0,0,0,0,1,0,1,0,0,0,0,0,1,0,1,0,0,0,0],
  [0,1,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,0],
  [0,1,0,0,1,0,0,0,1,0,1,0,0,0,1,0,0,1,0],
  [0,2,1,0,1,1,1,1,1,1,1,1,1,1,1,0,1,2,0],
  [0,0,1,0,1,0,1,0,0,0,0,0,1,0,1,0,1,0,0],
  [0,1,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,1,0],
  [0,1,0,0,0,0,0,0,1,0,1,0,0,0,0,0,0,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
]

export type Direction = 'up' | 'down' | 'left' | 'right'

export interface Position {
  x: number
  y: number
}

export interface Ghost {
  pos: Position
  dir: Direction
  color: string
  scared: boolean
  home: boolean
  name: GhostName
  releaseDelay: number // Ticks before release from home
}

// Death animation state
export interface DeathAnimation {
  active: boolean
  frame: number
  maxFrames: number
}

export const STARTING_GHOSTS: Ghost[] = [
  { pos: { x: 9, y: 9 }, dir: 'up', color: '#ff0000', scared: false, home: true, name: 'Blinky', releaseDelay: 0 },
  { pos: { x: 8, y: 9 }, dir: 'up', color: '#ffb8ff', scared: false, home: true, name: 'Pinky', releaseDelay: 30 },
  { pos: { x: 10, y: 9 }, dir: 'up', color: '#00ffff', scared: false, home: true, name: 'Inky', releaseDelay: 60 },
  { pos: { x: 9, y: 10 }, dir: 'up', color: '#ffb852', scared: false, home: true, name: 'Clyde', releaseDelay: 90 },
]

// Clone maze
export function cloneMaze(maze: number[][]): number[][] {
  return maze.map(row => [...row])
}

// Count dots in maze
export function countDots(maze: number[][]): number {
  let count = 0
  for (const row of maze) {
    for (const cell of row) {
      if (cell === 1 || cell === 2) count++
    }
  }
  return count
}

// Check if position is valid (not a wall)
export function isValidMove(maze: number[][], x: number, y: number): boolean {
  if (x < 0 || x >= MAZE_WIDTH || y < 0 || y >= MAZE_HEIGHT) {
    // Tunnel wrapping
    return true
  }
  return maze[y][x] !== 0
}

// Get opposite direction
export function oppositeDir(dir: Direction): Direction {
  const opposites: Record<Direction, Direction> = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left' }
  return opposites[dir]
}

// Move in direction
export function moveInDir(pos: Position, dir: Direction): Position {
  const moves: Record<Direction, Position> = {
    up: { x: pos.x, y: pos.y - 1 },
    down: { x: pos.x, y: pos.y + 1 },
    left: { x: pos.x - 1, y: pos.y },
    right: { x: pos.x + 1, y: pos.y } }
  const newPos = moves[dir]

  // Handle tunnel wrapping
  if (newPos.x < 0) newPos.x = MAZE_WIDTH - 1
  if (newPos.x >= MAZE_WIDTH) newPos.x = 0

  return newPos
}
