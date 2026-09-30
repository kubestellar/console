// Game constants
export type GameState = 'idle' | 'countdown' | 'playing' | 'paused' | 'finished'
export const CANVAS_WIDTH = 400
export const CANVAS_HEIGHT = 500
export const KART_WIDTH = 24
export const KART_HEIGHT = 36
export const TRACK_WIDTH = 280
export const MAX_SPEED = 8
export const ACCELERATION = 0.15
export const DECELERATION = 0.08
export const TURN_SPEED = 0.06
export const FRICTION = 0.98
export const COUNTDOWN_INTERVAL_MS = 1000
export const AI_COUNT = 3
export const FORWARD_ANGLE = -Math.PI / 2 // Pointing "up" on screen

// Track segments (y position, curve direction: -1 left, 0 straight, 1 right)
// TrackSegment interface reserved for future level variety

// Kart interface
export interface Kart {
  x: number
  y: number
  angle: number
  speed: number
  lap: number
  checkpoint: number
  isPlayer: boolean
  color: string
  name: string
}

// Power-up interface
export interface PowerUp {
  x: number
  y: number
  type: 'boost' | 'shield' | 'slow'
  collected: boolean
}

// Colors
export const COLORS = {
  track: '#333',
  trackEdge: '#ff0000',
  grass: '#228b22',
  player: '#3b82f6',
  ai1: '#ef4444',
  ai2: '#22c55e',
  ai3: '#f59e0b',
  boost: '#00ffff',
  shield: '#ff00ff',
  slow: '#ff6600' }

// Kubernetes-themed kart names
export const KART_NAMES = ['Pod Racer', 'Node Runner', 'Cluster Cruiser', 'Service Sprinter']

