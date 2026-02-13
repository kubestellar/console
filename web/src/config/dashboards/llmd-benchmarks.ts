/**
 * LLM-d Benchmarks Dashboard Configuration
 *
 * Performance tracking across clouds and accelerators.
 * All cards are full-width (12 columns) for maximum visual impact.
 */
import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const llmdBenchmarksDashboardConfig: UnifiedDashboardConfig = {
  id: 'llm-d-benchmarks',
  name: 'llm-d Benchmarks',
  subtitle: 'Performance tracking across clouds and accelerators',
  route: '/llm-d-benchmarks',
  statsType: 'ai-ml',
  cards: [
    { id: 'bench-hero-1', cardType: 'benchmark_hero', title: 'Latest Benchmark', position: { w: 12, h: 3 } },
    { id: 'bench-pareto-1', cardType: 'pareto_frontier', title: 'Pareto Frontier', position: { w: 12, h: 10 } },
    { id: 'bench-leaderboard-1', cardType: 'hardware_leaderboard', title: 'Hardware Leaderboard', position: { w: 12, h: 5 } },
    { id: 'bench-latency-1', cardType: 'latency_breakdown', title: 'Latency Breakdown', position: { w: 12, h: 4 } },
    { id: 'bench-throughput-1', cardType: 'throughput_comparison', title: 'Throughput Comparison', position: { w: 12, h: 4 } },
    { id: 'bench-timeline-1', cardType: 'performance_timeline', title: 'Performance Timeline', position: { w: 12, h: 5 } },
    { id: 'bench-resource-1', cardType: 'resource_utilization', title: 'Resource Utilization', position: { w: 12, h: 4 } },
  ],
  features: {
    dragDrop: true,
    addCard: true,
    autoRefresh: true,
    autoRefreshInterval: 60000,
  },
  storageKey: 'llmd-benchmarks-dashboard-cards',
}

export default llmdBenchmarksDashboardConfig
