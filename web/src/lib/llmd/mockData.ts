/**
 * LLM-d Mock Data for Visualizations
 *
 * Realistic mock data based on llm-d architecture and benchmark results.
 * Used when VPN is unavailable or for demo purposes.
 */

// KVCache status per pod
export interface KVCacheStats {
  podName: string
  cluster: string
  namespace: string
  utilizationPercent: number
  totalCapacityGB: number
  usedGB: number
  hitRate: number
  evictionRate: number
  lastUpdated: Date
}

// EPP routing distribution
export interface RoutingStats {
  source: string
  target: string
  requestsPerSecond: number
  percentage: number
  latencyMs: number
  type: 'prefill' | 'decode' | 'mixed'
}

// Server metrics for flow visualization
export interface ServerMetrics {
  name: string
  type: 'gateway' | 'epp' | 'prefill' | 'decode' | 'kvcache'
  status: 'healthy' | 'degraded' | 'unhealthy'
  load: number // 0-100
  queueDepth: number
  activeConnections: number
  throughputRps: number
}

// Benchmark results
export interface BenchmarkResult {
  model: string
  hardware: string
  configuration: 'baseline' | 'llm-d' | 'disaggregated'
  ttftMs: number
  tpotMs: number
  throughputTokensPerSec: number
  p50LatencyMs: number
  p95LatencyMs: number
  p99LatencyMs: number
}

// Generate realistic KVCache stats
export function generateKVCacheStats(): KVCacheStats[] {
  const pods = [
    { name: 'vllm-llama-70b-0', cluster: 'vllm-d', namespace: 'llm-d' },
    { name: 'vllm-llama-70b-1', cluster: 'vllm-d', namespace: 'llm-d' },
    { name: 'vllm-llama-70b-2', cluster: 'vllm-d', namespace: 'llm-d' },
    { name: 'vllm-granite-13b-0', cluster: 'platform-eval', namespace: 'llm-d' },
    { name: 'vllm-granite-13b-1', cluster: 'platform-eval', namespace: 'llm-d' },
    { name: 'vllm-qwen-32b-0', cluster: 'vllm-d', namespace: 'inference' },
  ]

  return pods.map(pod => {
    // Simulate realistic usage patterns
    const baseUtil = 40 + Math.random() * 40 // 40-80% typical
    const totalCapacity = pod.name.includes('70b') ? 80 : pod.name.includes('32b') ? 48 : 24

    return {
      podName: pod.name,
      cluster: pod.cluster,
      namespace: pod.namespace,
      utilizationPercent: Math.round(baseUtil + Math.sin(Date.now() / 10000) * 15),
      totalCapacityGB: totalCapacity,
      usedGB: Math.round((baseUtil / 100) * totalCapacity * 10) / 10,
      hitRate: 0.85 + Math.random() * 0.12, // 85-97% hit rate
      evictionRate: Math.random() * 0.05, // 0-5% eviction rate
      lastUpdated: new Date(),
    }
  })
}

// Generate EPP routing stats
export function generateRoutingStats(): RoutingStats[] {
  return [
    // Gateway to EPP
    { source: 'Gateway', target: 'EPP', requestsPerSecond: 450, percentage: 100, latencyMs: 2, type: 'mixed' },

    // EPP to Prefill servers
    { source: 'EPP', target: 'Prefill-0', requestsPerSecond: 120, percentage: 27, latencyMs: 45, type: 'prefill' },
    { source: 'EPP', target: 'Prefill-1', requestsPerSecond: 115, percentage: 26, latencyMs: 42, type: 'prefill' },
    { source: 'EPP', target: 'Prefill-2', requestsPerSecond: 95, percentage: 21, latencyMs: 48, type: 'prefill' },

    // EPP to Decode servers (for requests with cached KV)
    { source: 'EPP', target: 'Decode-0', requestsPerSecond: 65, percentage: 14, latencyMs: 8, type: 'decode' },
    { source: 'EPP', target: 'Decode-1', requestsPerSecond: 55, percentage: 12, latencyMs: 9, type: 'decode' },

    // Prefill to Decode handoff
    { source: 'Prefill-0', target: 'Decode-0', requestsPerSecond: 60, percentage: 50, latencyMs: 3, type: 'decode' },
    { source: 'Prefill-0', target: 'Decode-1', requestsPerSecond: 60, percentage: 50, latencyMs: 3, type: 'decode' },
    { source: 'Prefill-1', target: 'Decode-0', requestsPerSecond: 58, percentage: 50, latencyMs: 3, type: 'decode' },
    { source: 'Prefill-1', target: 'Decode-1', requestsPerSecond: 57, percentage: 50, latencyMs: 3, type: 'decode' },
    { source: 'Prefill-2', target: 'Decode-0', requestsPerSecond: 48, percentage: 50, latencyMs: 3, type: 'decode' },
    { source: 'Prefill-2', target: 'Decode-1', requestsPerSecond: 47, percentage: 50, latencyMs: 3, type: 'decode' },
  ]
}

// Generate server metrics for flow diagram
export function generateServerMetrics(): ServerMetrics[] {
  const now = Date.now()
  const wave = Math.sin(now / 5000) // Slow wave for realistic variation

  return [
    {
      name: 'Istio Gateway',
      type: 'gateway',
      status: 'healthy',
      load: Math.round(35 + wave * 10),
      queueDepth: Math.round(5 + Math.random() * 10),
      activeConnections: Math.round(120 + Math.random() * 30),
      throughputRps: Math.round(450 + wave * 50),
    },
    {
      name: 'EPP Scheduler',
      type: 'epp',
      status: 'healthy',
      load: Math.round(45 + wave * 15),
      queueDepth: Math.round(8 + Math.random() * 12),
      activeConnections: Math.round(450 + Math.random() * 50),
      throughputRps: Math.round(448 + wave * 48),
    },
    {
      name: 'Prefill-0',
      type: 'prefill',
      status: 'healthy',
      load: Math.round(70 + wave * 20),
      queueDepth: Math.round(3 + Math.random() * 5),
      activeConnections: Math.round(120 + Math.random() * 20),
      throughputRps: Math.round(120 + wave * 15),
    },
    {
      name: 'Prefill-1',
      type: 'prefill',
      status: 'healthy',
      load: Math.round(65 + wave * 18),
      queueDepth: Math.round(2 + Math.random() * 4),
      activeConnections: Math.round(115 + Math.random() * 18),
      throughputRps: Math.round(115 + wave * 12),
    },
    {
      name: 'Prefill-2',
      type: 'prefill',
      status: wave > 0.3 ? 'healthy' : 'degraded',
      load: Math.round(55 + wave * 25),
      queueDepth: Math.round(4 + Math.random() * 8),
      activeConnections: Math.round(95 + Math.random() * 15),
      throughputRps: Math.round(95 + wave * 10),
    },
    {
      name: 'Decode-0',
      type: 'decode',
      status: 'healthy',
      load: Math.round(50 + wave * 15),
      queueDepth: Math.round(1 + Math.random() * 3),
      activeConnections: Math.round(180 + Math.random() * 30),
      throughputRps: Math.round(180 + wave * 20),
    },
    {
      name: 'Decode-1',
      type: 'decode',
      status: 'healthy',
      load: Math.round(48 + wave * 12),
      queueDepth: Math.round(1 + Math.random() * 2),
      activeConnections: Math.round(175 + Math.random() * 25),
      throughputRps: Math.round(175 + wave * 18),
    },
    {
      name: 'KV Cache',
      type: 'kvcache',
      status: 'healthy',
      load: Math.round(60 + wave * 20),
      queueDepth: 0,
      activeConnections: Math.round(12 + Math.random() * 4),
      throughputRps: Math.round(1200 + wave * 200), // Cache ops/sec
    },
  ]
}

// Benchmark results based on real llm-d performance data
export function getBenchmarkResults(): BenchmarkResult[] {
  return [
    // Llama 70B benchmarks
    {
      model: 'Llama-3-70B',
      hardware: 'H100 x8',
      configuration: 'baseline',
      ttftMs: 850,
      tpotMs: 28,
      throughputTokensPerSec: 2400,
      p50LatencyMs: 780,
      p95LatencyMs: 1200,
      p99LatencyMs: 1650,
    },
    {
      model: 'Llama-3-70B',
      hardware: 'H100 x8',
      configuration: 'llm-d',
      ttftMs: 420,
      tpotMs: 22,
      throughputTokensPerSec: 3800,
      p50LatencyMs: 380,
      p95LatencyMs: 580,
      p99LatencyMs: 780,
    },
    {
      model: 'Llama-3-70B',
      hardware: 'H100 x8',
      configuration: 'disaggregated',
      ttftMs: 280,
      tpotMs: 18,
      throughputTokensPerSec: 4500,
      p50LatencyMs: 250,
      p95LatencyMs: 420,
      p99LatencyMs: 580,
    },

    // Granite 13B benchmarks
    {
      model: 'Granite-13B',
      hardware: 'A100 x4',
      configuration: 'baseline',
      ttftMs: 180,
      tpotMs: 12,
      throughputTokensPerSec: 4800,
      p50LatencyMs: 165,
      p95LatencyMs: 280,
      p99LatencyMs: 380,
    },
    {
      model: 'Granite-13B',
      hardware: 'A100 x4',
      configuration: 'llm-d',
      ttftMs: 95,
      tpotMs: 9,
      throughputTokensPerSec: 6500,
      p50LatencyMs: 85,
      p95LatencyMs: 145,
      p99LatencyMs: 195,
    },

    // DeepSeek-R1 MoE benchmarks (Wide Expert Parallelism)
    {
      model: 'DeepSeek-R1',
      hardware: 'H100 x16',
      configuration: 'baseline',
      ttftMs: 2200,
      tpotMs: 65,
      throughputTokensPerSec: 1200,
      p50LatencyMs: 2000,
      p95LatencyMs: 3500,
      p99LatencyMs: 4800,
    },
    {
      model: 'DeepSeek-R1',
      hardware: 'H100 x16',
      configuration: 'llm-d',
      ttftMs: 1100,
      tpotMs: 38,
      throughputTokensPerSec: 2800,
      p50LatencyMs: 980,
      p95LatencyMs: 1600,
      p99LatencyMs: 2200,
    },
  ]
}

// Configurator presets
export interface ConfiguratorPreset {
  id: string
  name: string
  description: string
  category: 'scheduling' | 'disaggregation' | 'parallelism' | 'autoscaling'
  parameters: {
    name: string
    value: number | string | boolean
    min?: number
    max?: number
    unit?: string
    description: string
  }[]
  expectedImpact: {
    ttftImprovement: number
    throughputImprovement: number
    costChange: number
  }
}

export function getConfiguratorPresets(): ConfiguratorPreset[] {
  return [
    {
      id: 'intelligent-scheduling',
      name: 'Intelligent Inference Scheduling',
      description: 'KV-cache aware routing with load balancing',
      category: 'scheduling',
      parameters: [
        { name: 'kvCacheAwareness', value: true, description: 'Route based on KV cache state' },
        { name: 'loadBalanceWeight', value: 0.7, min: 0, max: 1, description: 'Weight for load vs cache' },
        { name: 'prefillPriority', value: 'balanced', description: 'Prefill routing strategy' },
        { name: 'queueDepthThreshold', value: 10, min: 1, max: 50, description: 'Max queue before rebalance' },
      ],
      expectedImpact: { ttftImprovement: 35, throughputImprovement: 45, costChange: 0 },
    },
    {
      id: 'pd-disaggregation',
      name: 'Prefill/Decode Disaggregation',
      description: 'Separate prefill and decode onto specialized instances',
      category: 'disaggregation',
      parameters: [
        { name: 'prefillReplicas', value: 3, min: 1, max: 16, description: 'Number of prefill servers' },
        { name: 'decodeReplicas', value: 2, min: 1, max: 16, description: 'Number of decode servers' },
        { name: 'kvTransferProtocol', value: 'RDMA', description: 'KV cache transfer method' },
        { name: 'prefillGpuMemory', value: 80, min: 24, max: 80, unit: 'GB', description: 'GPU memory per prefill' },
      ],
      expectedImpact: { ttftImprovement: 55, throughputImprovement: 65, costChange: 15 },
    },
    {
      id: 'wide-expert-parallelism',
      name: 'Wide Expert Parallelism',
      description: 'Distribute MoE experts across multiple GPUs',
      category: 'parallelism',
      parameters: [
        { name: 'expertParallelism', value: 8, min: 2, max: 32, description: 'Expert parallel degree' },
        { name: 'dataParallelism', value: 2, min: 1, max: 8, description: 'Data parallel degree' },
        { name: 'tensorParallelism', value: 4, min: 1, max: 8, description: 'Tensor parallel degree' },
        { name: 'interconnect', value: 'NVLink', description: 'GPU interconnect type' },
      ],
      expectedImpact: { ttftImprovement: 50, throughputImprovement: 130, costChange: 25 },
    },
    {
      id: 'variant-autoscaling',
      name: 'Variant Autoscaling',
      description: 'Traffic and hardware-aware autoscaling',
      category: 'autoscaling',
      parameters: [
        { name: 'minReplicas', value: 2, min: 1, max: 10, description: 'Minimum replica count' },
        { name: 'maxReplicas', value: 16, min: 2, max: 64, description: 'Maximum replica count' },
        { name: 'targetQueueDepth', value: 5, min: 1, max: 20, description: 'Target queue depth' },
        { name: 'scaleUpCooldown', value: 60, min: 30, max: 300, unit: 's', description: 'Scale up cooldown' },
        { name: 'scaleDownCooldown', value: 300, min: 60, max: 600, unit: 's', description: 'Scale down cooldown' },
      ],
      expectedImpact: { ttftImprovement: 20, throughputImprovement: 40, costChange: -15 },
    },
  ]
}

// AI Insights mock data
export interface AIInsight {
  id: string
  type: 'optimization' | 'anomaly' | 'capacity' | 'performance'
  severity: 'info' | 'warning' | 'critical'
  title: string
  description: string
  recommendation: string
  metrics?: Record<string, number | string>
  timestamp: Date
}

export function generateAIInsights(): AIInsight[] {
  return [
    {
      id: 'insight-1',
      type: 'optimization',
      severity: 'info',
      title: 'KV Cache Hit Rate Optimization',
      description: 'Prefill-2 shows 12% lower cache hit rate compared to other prefill servers.',
      recommendation: 'Consider enabling prefix caching or adjusting the EPP routing weights to better distribute requests with similar prompts.',
      metrics: { 'Prefill-0': '94%', 'Prefill-1': '93%', 'Prefill-2': '82%' },
      timestamp: new Date(),
    },
    {
      id: 'insight-2',
      type: 'performance',
      severity: 'info',
      title: 'Disaggregation Opportunity',
      description: 'Current workload shows 65% of latency in prefill phase. Disaggregated serving could reduce TTFT by 50%.',
      recommendation: 'Enable Prefill/Decode disaggregation with 3:2 prefill-to-decode ratio.',
      metrics: { 'Prefill Time': '65%', 'Decode Time': '35%', 'Potential TTFT Reduction': '50%' },
      timestamp: new Date(),
    },
    {
      id: 'insight-3',
      type: 'capacity',
      severity: 'warning',
      title: 'Approaching GPU Memory Limit',
      description: 'vllm-llama-70b-0 KV cache utilization at 87%. Risk of evictions under burst load.',
      recommendation: 'Scale up decode replicas or enable KV cache offloading to host memory.',
      metrics: { 'Current Utilization': '87%', 'Eviction Threshold': '95%', 'Buffer': '8%' },
      timestamp: new Date(),
    },
    {
      id: 'insight-4',
      type: 'anomaly',
      severity: 'info',
      title: 'Request Pattern Change Detected',
      description: 'Average prompt length increased 40% in the last hour. This may impact prefill performance.',
      recommendation: 'Monitor TTFT metrics. Consider adjusting prefill replica count if latency increases.',
      metrics: { 'Avg Prompt Length': '+40%', 'TTFT Change': '+15%' },
      timestamp: new Date(Date.now() - 1800000), // 30 min ago
    },
  ]
}
