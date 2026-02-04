/**
 * Prefill/Decode Disaggregation Visualization
 *
 * Split panel showing the disaggregated serving architecture
 * with animated token transfer between stages.
 */
import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Split, ArrowRight, Cpu, Zap, Clock, Activity } from 'lucide-react'

interface ServerStats {
  id: string
  name: string
  type: 'prefill' | 'decode'
  load: number
  queueDepth: number
  throughput: number
  latencyMs: number
  gpuMemory: number
}

interface TransferPacket {
  id: string
  fromServer: string
  toServer: string
  progress: number
  size: number // KB
}

// Generate realistic server stats
function generateServerStats(): ServerStats[] {
  const wave = Math.sin(Date.now() / 5000)

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
      gpuMemory: Math.round(75 + wave * 10),
    },
    {
      id: 'prefill-1',
      name: 'Prefill-1',
      type: 'prefill',
      load: Math.round(65 + wave * 12),
      queueDepth: Math.round(2 + Math.random() * 3),
      throughput: Math.round(115 + wave * 18),
      latencyMs: Math.round(42 + wave * 8),
      gpuMemory: Math.round(72 + wave * 8),
    },
    {
      id: 'prefill-2',
      name: 'Prefill-2',
      type: 'prefill',
      load: Math.round(55 + wave * 20),
      queueDepth: Math.round(4 + Math.random() * 5),
      throughput: Math.round(95 + wave * 15),
      latencyMs: Math.round(48 + wave * 12),
      gpuMemory: Math.round(68 + wave * 12),
    },
    // Decode servers
    {
      id: 'decode-0',
      name: 'Decode-0',
      type: 'decode',
      load: Math.round(50 + wave * 10),
      queueDepth: Math.round(1 + Math.random() * 2),
      throughput: Math.round(180 + wave * 25),
      latencyMs: Math.round(8 + wave * 2),
      gpuMemory: Math.round(85 + wave * 8),
    },
    {
      id: 'decode-1',
      name: 'Decode-1',
      type: 'decode',
      load: Math.round(48 + wave * 8),
      queueDepth: Math.round(1 + Math.random() * 2),
      throughput: Math.round(175 + wave * 22),
      latencyMs: Math.round(9 + wave * 2),
      gpuMemory: Math.round(82 + wave * 10),
    },
  ]
}

interface ServerCardProps {
  server: ServerStats
  isHighlighted?: boolean
}

function ServerCard({ server, isHighlighted }: ServerCardProps) {
  const isPrefill = server.type === 'prefill'
  const color = isPrefill ? '#9333ea' : '#22c55e'
  const bgColor = isPrefill ? 'bg-purple-500/10' : 'bg-green-500/10'
  const borderColor = isPrefill ? 'border-purple-500/30' : 'border-green-500/30'

  return (
    <motion.div
      className={`${bgColor} ${borderColor} border rounded-lg p-3 ${
        isHighlighted ? 'ring-2 ring-white/30' : ''
      }`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-white text-sm">{server.name}</span>
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: server.load > 70 ? '#f59e0b' : color }}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Load</span>
          <div className="flex items-center gap-1 mt-0.5">
            <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: server.load > 70 ? '#f59e0b' : color }}
                initial={{ width: 0 }}
                animate={{ width: `${server.load}%` }}
              />
            </div>
            <span className="text-white font-mono w-8">{server.load}%</span>
          </div>
        </div>

        <div>
          <span className="text-muted-foreground">Queue</span>
          <div className="text-white font-mono mt-0.5">{server.queueDepth}</div>
        </div>

        <div>
          <span className="text-muted-foreground">Throughput</span>
          <div className="text-white font-mono mt-0.5">{server.throughput} rps</div>
        </div>

        <div>
          <span className="text-muted-foreground">{isPrefill ? 'TTFT' : 'TPOT'}</span>
          <div className="text-white font-mono mt-0.5">{server.latencyMs}ms</div>
        </div>
      </div>

      {/* GPU memory bar */}
      <div className="mt-2">
        <div className="flex justify-between text-xs mb-0.5">
          <span className="text-muted-foreground">GPU Mem</span>
          <span className="text-white font-mono">{server.gpuMemory}%</span>
        </div>
        <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{
              backgroundColor: server.gpuMemory > 85 ? '#ef4444' : server.gpuMemory > 70 ? '#f59e0b' : '#22c55e',
            }}
            animate={{ width: `${server.gpuMemory}%` }}
          />
        </div>
      </div>
    </motion.div>
  )
}

export function PDDisaggregation() {
  const [servers, setServers] = useState<ServerStats[]>([])
  const [packets, setPackets] = useState<TransferPacket[]>([])

  // Update stats
  useEffect(() => {
    const update = () => setServers(generateServerStats())
    update()
    const interval = setInterval(update, 2000)
    return () => clearInterval(interval)
  }, [])

  // Generate transfer packets
  useEffect(() => {
    const spawnPacket = () => {
      const prefillServers = ['prefill-0', 'prefill-1', 'prefill-2']
      const decodeServers = ['decode-0', 'decode-1']

      const from = prefillServers[Math.floor(Math.random() * prefillServers.length)]
      const to = decodeServers[Math.floor(Math.random() * decodeServers.length)]

      const newPacket: TransferPacket = {
        id: `packet-${Date.now()}`,
        fromServer: from,
        toServer: to,
        progress: 0,
        size: Math.round(50 + Math.random() * 200),
      }

      setPackets(prev => [...prev.slice(-10), newPacket])
    }

    const interval = setInterval(spawnPacket, 800)
    return () => clearInterval(interval)
  }, [])

  // Animate packets
  useEffect(() => {
    const animate = setInterval(() => {
      setPackets(prev =>
        prev
          .map(p => ({ ...p, progress: p.progress + 0.05 }))
          .filter(p => p.progress < 1)
      )
    }, 50)
    return () => clearInterval(animate)
  }, [])

  const prefillServers = useMemo(() => servers.filter(s => s.type === 'prefill'), [servers])
  const decodeServers = useMemo(() => servers.filter(s => s.type === 'decode'), [servers])

  // Aggregate metrics
  const metrics = useMemo(() => {
    const prefill = prefillServers.reduce((acc, s) => ({
      throughput: acc.throughput + s.throughput,
      avgLatency: acc.avgLatency + s.latencyMs,
    }), { throughput: 0, avgLatency: 0 })

    const decode = decodeServers.reduce((acc, s) => ({
      throughput: acc.throughput + s.throughput,
      avgLatency: acc.avgLatency + s.latencyMs,
    }), { throughput: 0, avgLatency: 0 })

    return {
      prefillThroughput: prefill.throughput,
      prefillAvgTTFT: prefillServers.length ? Math.round(prefill.avgLatency / prefillServers.length) : 0,
      decodeThroughput: decode.throughput,
      decodeAvgTPOT: decodeServers.length ? Math.round(decode.avgLatency / decodeServers.length) : 0,
      kvTransferRate: Math.round(packets.length * 150), // Simulated KB/s
    }
  }, [prefillServers, decodeServers, packets])

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Split size={18} className="text-cyan-400" />
          <span className="font-medium text-white">P/D Disaggregation</span>
        </div>
        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded">
          Demo
        </span>
      </div>

      {/* Metrics summary */}
      <div className="grid grid-cols-5 gap-2 mb-4">
        <div className="bg-purple-500/10 rounded-lg p-2 text-center">
          <div className="flex items-center justify-center gap-1 text-purple-400 mb-1">
            <Cpu size={12} />
            <span className="text-xs">Prefill</span>
          </div>
          <div className="text-white font-mono text-sm">{metrics.prefillThroughput}</div>
          <div className="text-xs text-muted-foreground">rps</div>
        </div>

        <div className="bg-purple-500/10 rounded-lg p-2 text-center">
          <div className="flex items-center justify-center gap-1 text-purple-400 mb-1">
            <Clock size={12} />
            <span className="text-xs">TTFT</span>
          </div>
          <div className="text-white font-mono text-sm">{metrics.prefillAvgTTFT}</div>
          <div className="text-xs text-muted-foreground">ms</div>
        </div>

        <div className="bg-cyan-500/10 rounded-lg p-2 text-center">
          <div className="flex items-center justify-center gap-1 text-cyan-400 mb-1">
            <Zap size={12} />
            <span className="text-xs">Transfer</span>
          </div>
          <div className="text-white font-mono text-sm">{metrics.kvTransferRate}</div>
          <div className="text-xs text-muted-foreground">KB/s</div>
        </div>

        <div className="bg-green-500/10 rounded-lg p-2 text-center">
          <div className="flex items-center justify-center gap-1 text-green-400 mb-1">
            <Activity size={12} />
            <span className="text-xs">Decode</span>
          </div>
          <div className="text-white font-mono text-sm">{metrics.decodeThroughput}</div>
          <div className="text-xs text-muted-foreground">rps</div>
        </div>

        <div className="bg-green-500/10 rounded-lg p-2 text-center">
          <div className="flex items-center justify-center gap-1 text-green-400 mb-1">
            <Clock size={12} />
            <span className="text-xs">TPOT</span>
          </div>
          <div className="text-white font-mono text-sm">{metrics.decodeAvgTPOT}</div>
          <div className="text-xs text-muted-foreground">ms</div>
        </div>
      </div>

      {/* Split view */}
      <div className="flex-1 flex gap-4 relative">
        {/* Prefill panel */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-purple-500" />
            <span className="text-sm font-medium text-purple-400">Prefill Servers</span>
          </div>
          <div className="flex-1 space-y-2 overflow-auto">
            {prefillServers.map(server => (
              <ServerCard key={server.id} server={server} />
            ))}
          </div>
        </div>

        {/* Transfer zone */}
        <div className="w-20 flex flex-col items-center justify-center relative">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-px h-full bg-gradient-to-b from-purple-500/20 via-cyan-500/40 to-green-500/20" />
          </div>

          {/* Animated packets */}
          <AnimatePresence>
            {packets.map(packet => (
              <motion.div
                key={packet.id}
                className="absolute w-4 h-4 rounded bg-cyan-500 flex items-center justify-center"
                style={{
                  top: `${20 + packet.progress * 60}%`,
                  filter: 'drop-shadow(0 0 6px #06b6d4)',
                }}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
              >
                <ArrowRight size={10} className="text-white" />
              </motion.div>
            ))}
          </AnimatePresence>

          <div className="z-10 bg-slate-900 px-2 py-1 rounded text-xs text-cyan-400">
            KV Cache
          </div>
        </div>

        {/* Decode panel */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-sm font-medium text-green-400">Decode Servers</span>
          </div>
          <div className="flex-1 space-y-2 overflow-auto">
            {decodeServers.map(server => (
              <ServerCard key={server.id} server={server} />
            ))}
          </div>
        </div>
      </div>

      {/* Architecture explanation */}
      <div className="mt-4 text-xs text-muted-foreground text-center">
        Prefill processes prompts → KV cache transferred via RDMA → Decode generates tokens
      </div>
    </div>
  )
}

export default PDDisaggregation
