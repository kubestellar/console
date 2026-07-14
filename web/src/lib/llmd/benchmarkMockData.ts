/**
 * LLM-d Benchmark Mock Data — barrel re-export.
 *
 * TypeScript interfaces and generators mirroring the llm-d-benchmark v0.2
 * Benchmark Report schema. Used for dashboard visualization when no live
 * backend is connected.
 *
 * Data is split across sibling files to keep each under the max-lines limit:
 *   - benchmarkMockData.types.ts       (interfaces)
 *   - benchmarkMockData.generators.ts  (constants, helpers, report generators)
 *   - benchmarkMockData.pareto.ts      (Pareto / leaderboard analysis)
 * Public exports are preserved — external callers keep importing from
 * './benchmarkMockData'.
 *
 * Schema reference: llm-d/llm-d-benchmark/benchmark_report/schema_v0_2.py
 */

export type {
  Statistics,
  Accelerator,
  StackComponent,
  LoadConfig,
  LatencyStats,
  ThroughputStats,
  RequestStats,
  TimeSeriesPoint,
  ObservabilityMetric,
  ComponentHealth,
  BenchmarkReport,
  ParetoPoint,
  LeaderboardRow,
  TimelinePoint,
} from './benchmarkMockData.types'

export {
  HARDWARE_SPECS,
  generateBenchmarkReport,
  generateBenchmarkReports,
  generateTimelineReports,
} from './benchmarkMockData.generators'

export {
  extractParetoPoints,
  computeParetoFrontier,
  generateLeaderboardRows,
  getHardwareShort,
  getModelShort,
  HARDWARE_COLORS,
  CONFIG_COLORS,
} from './benchmarkMockData.pareto'
