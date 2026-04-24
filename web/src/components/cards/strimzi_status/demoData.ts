/**
 * Strimzi Status Card — Demo Data & Type Definitions
 *
 * Strimzi is a CNCF Incubating project that runs Apache Kafka on Kubernetes
 * via a set of Operators (Cluster Operator, Topic Operator, User Operator).
 * This card surfaces the operational signals a platform team needs to watch
 * a Strimzi-managed fleet: Kafka cluster health, broker readiness, topic
 * counts, consumer groups, and end-to-end consumer lag.
 *
 * The card lists MULTIPLE Kafka clusters (one Strimzi operator instance can
 * manage several Kafka CRs), each with its own broker/topic/consumer-group
 * aggregates.
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real Strimzi bridge lands (`/api/strimzi/status`), the hook's fetcher will
 * pick up live data automatically with no component changes.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StrimziHealth = 'healthy' | 'degraded' | 'not-installed'
export type ClusterHealth = 'healthy' | 'degraded' | 'unavailable'
export type TopicStatus = 'active' | 'inactive' | 'error'
export type ConsumerGroupStatus = 'ok' | 'warning' | 'error'

export interface StrimziTopic {
  name: string
  partitions: number
  replicationFactor: number
  status: TopicStatus
}

export interface StrimziConsumerGroup {
  groupId: string
  members: number
  lag: number
  status: ConsumerGroupStatus
}

export interface StrimziKafkaCluster {
  name: string
  namespace: string
  cluster: string
  kafkaVersion: string
  health: ClusterHealth
  brokers: { ready: number; total: number }
  topics: StrimziTopic[]
  consumerGroups: StrimziConsumerGroup[]
  totalLag: number
}

export interface StrimziStats {
  clusterCount: number
  brokerCount: number
  topicCount: number
  consumerGroupCount: number
  totalLag: number
  operatorVersion: string
}

export interface StrimziSummary {
  totalClusters: number
  healthyClusters: number
  totalBrokers: number
  readyBrokers: number
}

export interface StrimziStatusData {
  health: StrimziHealth
  clusters: StrimziKafkaCluster[]
  stats: StrimziStats
  summary: StrimziSummary
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo-data constants (named — no magic numbers)
// ---------------------------------------------------------------------------

const DEMO_OPERATOR_VERSION = '0.41.0'
const DEMO_KAFKA_VERSION = '3.7.0'
const DEMO_BROKERS_PER_CLUSTER = 3
const DEMO_REPLICATION_FACTOR = 3

// Partition counts for demo topics (tuned to realistic shapes)
const PARTITIONS_XL = 24
const PARTITIONS_L = 12
const PARTITIONS_M = 6
const PARTITIONS_S = 3
const PARTITIONS_XS = 1

// Consumer-group lag values (messages behind head) — realistic
// operational spread: healthy groups at 0, warnings around 100,
// errors well past the warning threshold.
const LAG_ZERO = 0
const LAG_LOW = 42
const LAG_MEDIUM = 180
const LAG_HIGH = 1_250
const LAG_CRITICAL = 5_800

const MEMBERS_SMALL = 2
const MEMBERS_MEDIUM = 4
const MEMBERS_LARGE = 8

// ---------------------------------------------------------------------------
// Demo data — shown when Strimzi is not installed or in demo mode
// ---------------------------------------------------------------------------

const DEMO_CLUSTER_A_TOPICS: StrimziTopic[] = [
  { name: 'orders',          partitions: PARTITIONS_L,  replicationFactor: DEMO_REPLICATION_FACTOR, status: 'active' },
  { name: 'payments',        partitions: PARTITIONS_M,  replicationFactor: DEMO_REPLICATION_FACTOR, status: 'active' },
  { name: 'inventory',       partitions: PARTITIONS_M,  replicationFactor: DEMO_REPLICATION_FACTOR, status: 'active' },
  { name: 'user-events',     partitions: PARTITIONS_L,  replicationFactor: DEMO_REPLICATION_FACTOR, status: 'active' },
  { name: 'audit-log',       partitions: PARTITIONS_S,  replicationFactor: DEMO_REPLICATION_FACTOR, status: 'active' },
  { name: 'shipment-events', partitions: PARTITIONS_M,  replicationFactor: DEMO_REPLICATION_FACTOR, status: 'active' },
  { name: 'notifications',   partitions: PARTITIONS_S,  replicationFactor: DEMO_REPLICATION_FACTOR, status: 'active' },
  { name: 'cart-updates',    partitions: PARTITIONS_M,  replicationFactor: DEMO_REPLICATION_FACTOR, status: 'active' },
  { name: 'search-index',    partitions: PARTITIONS_L,  replicationFactor: DEMO_REPLICATION_FACTOR, status: 'active' },
  { name: 'alerts',          partitions: PARTITIONS_S,  replicationFactor: DEMO_REPLICATION_FACTOR, status: 'inactive' },
  { name: 'promotions',      partitions: PARTITIONS_S,  replicationFactor: DEMO_REPLICATION_FACTOR, status: 'active' },
  { name: 'dead-letter',     partitions: PARTITIONS_XS, replicationFactor: DEMO_REPLICATION_FACTOR, status: 'active' },
]

const DEMO_CLUSTER_A_GROUPS: StrimziConsumerGroup[] = [
  { groupId: 'order-service',       members: MEMBERS_LARGE,  lag: LAG_ZERO,   status: 'ok' },
  { groupId: 'payment-processor',   members: MEMBERS_MEDIUM, lag: LAG_MEDIUM, status: 'warning' },
  { groupId: 'inventory-projector', members: MEMBERS_MEDIUM, lag: LAG_LOW,    status: 'ok' },
  { groupId: 'analytics-pipeline',  members: MEMBERS_LARGE,  lag: LAG_ZERO,   status: 'ok' },
  { groupId: 'notification-sender', members: MEMBERS_SMALL,  lag: LAG_ZERO,   status: 'ok' },
]

const DEMO_CLUSTER_B_TOPICS: StrimziTopic[] = [
  { name: 'telemetry-metrics',    partitions: PARTITIONS_XL, replicationFactor: DEMO_REPLICATION_FACTOR, status: 'active' },
  { name: 'telemetry-traces',     partitions: PARTITIONS_L,  replicationFactor: DEMO_REPLICATION_FACTOR, status: 'active' },
  { name: 'telemetry-logs',       partitions: PARTITIONS_L,  replicationFactor: DEMO_REPLICATION_FACTOR, status: 'active' },
  { name: 'device-events',        partitions: PARTITIONS_L,  replicationFactor: DEMO_REPLICATION_FACTOR, status: 'active' },
  { name: 'device-heartbeat',     partitions: PARTITIONS_M,  replicationFactor: DEMO_REPLICATION_FACTOR, status: 'active' },
  { name: 'device-firmware',      partitions: PARTITIONS_S,  replicationFactor: DEMO_REPLICATION_FACTOR, status: 'active' },
  { name: 'iot-commands',         partitions: PARTITIONS_M,  replicationFactor: DEMO_REPLICATION_FACTOR, status: 'active' },
  { name: 'iot-responses',        partitions: PARTITIONS_M,  replicationFactor: DEMO_REPLICATION_FACTOR, status: 'active' },
  { name: 'anomaly-detections',   partitions: PARTITIONS_S,  replicationFactor: DEMO_REPLICATION_FACTOR, status: 'active' },
  { name: 'ml-feature-store',     partitions: PARTITIONS_L,  replicationFactor: DEMO_REPLICATION_FACTOR, status: 'active' },
  { name: 'ingest-retry',         partitions: PARTITIONS_S,  replicationFactor: DEMO_REPLICATION_FACTOR, status: 'error' },
  { name: 'dead-letter',          partitions: PARTITIONS_XS, replicationFactor: DEMO_REPLICATION_FACTOR, status: 'active' },
]

const DEMO_CLUSTER_B_GROUPS: StrimziConsumerGroup[] = [
  { groupId: 'metrics-writer',      members: MEMBERS_LARGE,  lag: LAG_HIGH,     status: 'warning' },
  { groupId: 'trace-ingester',      members: MEMBERS_MEDIUM, lag: LAG_LOW,      status: 'ok' },
  { groupId: 'log-indexer',         members: MEMBERS_LARGE,  lag: LAG_MEDIUM,   status: 'warning' },
  { groupId: 'anomaly-detector',    members: MEMBERS_SMALL,  lag: LAG_ZERO,     status: 'ok' },
  { groupId: 'retry-reprocessor',   members: MEMBERS_SMALL,  lag: LAG_CRITICAL, status: 'error' },
]

const DEMO_CLUSTER_A: StrimziKafkaCluster = {
  name: 'orders-kafka',
  namespace: 'kafka',
  cluster: 'prod-east',
  kafkaVersion: DEMO_KAFKA_VERSION,
  health: 'healthy',
  brokers: { ready: DEMO_BROKERS_PER_CLUSTER, total: DEMO_BROKERS_PER_CLUSTER },
  topics: DEMO_CLUSTER_A_TOPICS,
  consumerGroups: DEMO_CLUSTER_A_GROUPS,
  totalLag: DEMO_CLUSTER_A_GROUPS.reduce((sum, g) => sum + g.lag, 0),
}

const DEMO_CLUSTER_B: StrimziKafkaCluster = {
  name: 'telemetry-kafka',
  namespace: 'observability',
  cluster: 'prod-west',
  kafkaVersion: DEMO_KAFKA_VERSION,
  health: 'degraded',
  brokers: { ready: DEMO_BROKERS_PER_CLUSTER, total: DEMO_BROKERS_PER_CLUSTER },
  topics: DEMO_CLUSTER_B_TOPICS,
  consumerGroups: DEMO_CLUSTER_B_GROUPS,
  totalLag: DEMO_CLUSTER_B_GROUPS.reduce((sum, g) => sum + g.lag, 0),
}

const DEMO_CLUSTERS: StrimziKafkaCluster[] = [DEMO_CLUSTER_A, DEMO_CLUSTER_B]

function sumTopics(clusters: StrimziKafkaCluster[]): number {
  return clusters.reduce((sum, c) => sum + c.topics.length, 0)
}

function sumGroups(clusters: StrimziKafkaCluster[]): number {
  return clusters.reduce((sum, c) => sum + c.consumerGroups.length, 0)
}

function sumBrokers(clusters: StrimziKafkaCluster[]): { ready: number; total: number } {
  return clusters.reduce(
    (acc, c) => ({ ready: acc.ready + c.brokers.ready, total: acc.total + c.brokers.total }),
    { ready: 0, total: 0 },
  )
}

function sumLag(clusters: StrimziKafkaCluster[]): number {
  return clusters.reduce((sum, c) => sum + c.totalLag, 0)
}

const DEMO_BROKERS = sumBrokers(DEMO_CLUSTERS)
const DEMO_HEALTHY = DEMO_CLUSTERS.filter(c => c.health === 'healthy').length

export const STRIMZI_DEMO_DATA: StrimziStatusData = {
  health: DEMO_CLUSTERS.every(c => c.health === 'healthy') ? 'healthy' : 'degraded',
  clusters: DEMO_CLUSTERS,
  stats: {
    clusterCount: DEMO_CLUSTERS.length,
    brokerCount: DEMO_BROKERS.total,
    topicCount: sumTopics(DEMO_CLUSTERS),
    consumerGroupCount: sumGroups(DEMO_CLUSTERS),
    totalLag: sumLag(DEMO_CLUSTERS),
    operatorVersion: DEMO_OPERATOR_VERSION,
  },
  summary: {
    totalClusters: DEMO_CLUSTERS.length,
    healthyClusters: DEMO_HEALTHY,
    totalBrokers: DEMO_BROKERS.total,
    readyBrokers: DEMO_BROKERS.ready,
  },
  lastCheckTime: new Date().toISOString(),
}
