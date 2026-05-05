import { safeLazy } from '../../lib/safeLazy'
import type { CardRegistryCategory } from './cardRegistry.types'
import { EventStream } from './EventStream'
import { ClusterMetrics } from './ClusterMetrics'
import { HardwareHealthCard } from './HardwareHealthCard'
import { PodIssues } from './PodIssues'

const EventSummary = safeLazy(() => import('./EventSummary'), 'EventSummary')
const WarningEvents = safeLazy(() => import('./WarningEvents'), 'WarningEvents')
const RecentEvents = safeLazy(() => import('./RecentEvents'), 'RecentEvents')
const EventsTimeline = safeLazy(() => import('./EventsTimeline'), 'EventsTimeline')
const PodHealthTrend = safeLazy(() => import('./PodHealthTrend'), 'PodHealthTrend')
const ResourceTrend = safeLazy(() => import('./ResourceTrend'), 'ResourceTrend')
const GPUUtilization = safeLazy(() => import('./GPUUtilization'), 'GPUUtilization')
const GPUUsageTrend = safeLazy(() => import('./GPUUsageTrend'), 'GPUUsageTrend')
const ProactiveGPUNodeHealthMonitor = safeLazy(() => import('./ProactiveGPUNodeHealthMonitor'), 'ProactiveGPUNodeHealthMonitor')
const GitHubActivity = safeLazy(() => import('./GitHubActivity'), 'GitHubActivity')
const IssueActivityChart = safeLazy(() => import('./IssueActivityChart'), 'IssueActivityChart')
const RSSFeed = safeLazy(() => import('./rss'), 'RSSFeed')

export const observabilityCardRegistry: CardRegistryCategory = {
  components: {
    event_stream: EventStream, event_summary: EventSummary, warning_events: WarningEvents, recent_events: RecentEvents,
    cluster_metrics: ClusterMetrics, events_timeline: EventsTimeline, pod_health_trend: PodHealthTrend,
    resource_trend: ResourceTrend, gpu_utilization: GPUUtilization, gpu_usage_trend: GPUUsageTrend,
    hardware_health: HardwareHealthCard, gpu_node_health: ProactiveGPUNodeHealthMonitor,
    github_activity: GitHubActivity, issue_activity_chart: IssueActivityChart, rss_feed: RSSFeed,
    memory_trend: ClusterMetrics, cpu_trend: ClusterMetrics, error_count: PodIssues,
  },
  preloaders: {
    event_stream: () => import('./EventStream'), event_summary: () => import('./EventSummary'), warning_events: () => import('./WarningEvents'),
    recent_events: () => import('./RecentEvents'), cluster_metrics: () => import('./ClusterMetrics'), events_timeline: () => import('./EventsTimeline'),
    pod_health_trend: () => import('./PodHealthTrend'), resource_trend: () => import('./ResourceTrend'), gpu_utilization: () => import('./GPUUtilization'),
    gpu_usage_trend: () => import('./GPUUsageTrend'), hardware_health: () => import('./HardwareHealthCard'),
    gpu_node_health: () => import('./ProactiveGPUNodeHealthMonitor'), github_activity: () => import('./GitHubActivity'),
    issue_activity_chart: () => import('./IssueActivityChart'), rss_feed: () => import('./rss'),
  },
  defaultWidths: {
    event_summary: 6, warning_events: 6, recent_events: 6, event_stream: 6, cluster_metrics: 8, pod_health_trend: 8,
    events_timeline: 8, resource_trend: 8, gpu_utilization: 8, gpu_usage_trend: 8, hardware_health: 6, gpu_node_health: 6,
    github_activity: 8, issue_activity_chart: 12, rss_feed: 6,
  },
  liveDataCards: ['event_summary', 'warning_events', 'recent_events', 'cluster_metrics', 'events_timeline', 'pod_health_trend', 'resource_trend', 'gpu_utilization', 'gpu_usage_trend', 'gpu_node_health'],
}
