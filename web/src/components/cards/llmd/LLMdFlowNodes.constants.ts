export const NODE_POSITIONS = {
  client: { x: 10, y: 50 },
  gateway: { x: 28, y: 50 },
  epp: { x: 48, y: 50 },
  prefill0: { x: 70, y: 18 },
  prefill1: { x: 70, y: 50 },
  prefill2: { x: 70, y: 82 },
  decode0: { x: 92, y: 34 },
  decode1: { x: 92, y: 66 } }

// Node styling constants
export const NODE_RADIUS = 6
export const STROKE_WIDTH = 1.5
export const TRACK_WIDTH = 1

// Connection between nodes
export interface Connection {
  from: keyof typeof NODE_POSITIONS
  to: keyof typeof NODE_POSITIONS
  type: 'prefill' | 'decode' | 'kv-transfer'
  trafficPercent: number
}

export const CONNECTIONS: Connection[] = [
  { from: 'client', to: 'gateway', type: 'prefill', trafficPercent: 100 },
  { from: 'gateway', to: 'epp', type: 'prefill', trafficPercent: 100 },
  { from: 'epp', to: 'prefill0', type: 'prefill', trafficPercent: 27 },
  { from: 'epp', to: 'prefill1', type: 'prefill', trafficPercent: 26 },
  { from: 'epp', to: 'prefill2', type: 'prefill', trafficPercent: 21 },
  { from: 'epp', to: 'decode0', type: 'decode', trafficPercent: 14 },
  { from: 'epp', to: 'decode1', type: 'decode', trafficPercent: 12 },
  { from: 'prefill0', to: 'decode0', type: 'decode', trafficPercent: 50 },
  { from: 'prefill0', to: 'decode1', type: 'decode', trafficPercent: 50 },
  { from: 'prefill1', to: 'decode0', type: 'decode', trafficPercent: 50 },
  { from: 'prefill1', to: 'decode1', type: 'decode', trafficPercent: 50 },
  { from: 'prefill2', to: 'decode0', type: 'decode', trafficPercent: 50 },
  { from: 'prefill2', to: 'decode1', type: 'decode', trafficPercent: 50 },
]

// Color palette
export const COLORS = {
  prefill: '#9333ea',
  decode: '#22c55e',
  'kv-transfer': '#06b6d4',
  gateway: '#3b82f6',
  epp: '#f59e0b' }

// Metric colors
export const METRIC_LOAD_COLOR = '#f59e0b'
export const METRIC_QUEUE_COLOR = '#06b6d4'
