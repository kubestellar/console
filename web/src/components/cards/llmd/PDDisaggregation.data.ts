// Types and demo-data generator for the PDDisaggregation card.
// Extracted from PDDisaggregation.tsx (issue #24058) — logic unchanged.

export const WAVE_PERIOD_MS = 5_000

export interface ServerStats {
  id: string
  name: string
  type: 'prefill' | 'decode'
  load: number
  queueDepth: number
  throughput: number
  latencyMs: number
  gpuMemory: number
}

export interface TransferPacket {
  id: string
  fromServer: string
  toServer: string
  progress: number
  size: number // KB
}

// Generate realistic server stats
export function generateServerStats(): ServerStats[] {
  const wave = Math.sin(Date.now() / WAVE_PERIOD_MS)

  return [
    // Prefill servers
    {
      id: 'prefill-0',
      name: 'Prefill-0',
      type: 'prefill',
      load: Math.round(70 + wave * 15),
      queueDepth: Math.round(3 + Math.random() * 4),
      throughput: Math.round(120 + wave * 20),
      latencyMs: Math.round(45 + wave * 10),
      gpuMemory: Math.round(75 + wave * 10) },
    {
      id: 'prefill-1',
      name: 'Prefill-1',
      type: 'prefill',
      load: Math.round(65 + wave * 12),
      queueDepth: Math.round(2 + Math.random() * 3),
      throughput: Math.round(115 + wave * 18),
      latencyMs: Math.round(42 + wave * 8),
      gpuMemory: Math.round(72 + wave * 8) },
    {
      id: 'prefill-2',
      name: 'Prefill-2',
      type: 'prefill',
      load: Math.round(55 + wave * 20),
      queueDepth: Math.round(4 + Math.random() * 5),
      throughput: Math.round(95 + wave * 15),
      latencyMs: Math.round(48 + wave * 12),
      gpuMemory: Math.round(68 + wave * 12) },
    // Decode servers
    {
      id: 'decode-0',
      name: 'Decode-0',
      type: 'decode',
      load: Math.round(50 + wave * 10),
      queueDepth: Math.round(1 + Math.random() * 2),
      throughput: Math.round(180 + wave * 25),
      latencyMs: Math.round(8 + wave * 2),
      gpuMemory: Math.round(85 + wave * 8) },
    {
      id: 'decode-1',
      name: 'Decode-1',
      type: 'decode',
      load: Math.round(48 + wave * 8),
      queueDepth: Math.round(1 + Math.random() * 2),
      throughput: Math.round(175 + wave * 22),
      latencyMs: Math.round(9 + wave * 2),
      gpuMemory: Math.round(82 + wave * 10) },
  ]
}
