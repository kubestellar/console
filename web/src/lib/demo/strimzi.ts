/**
 * Strimzi demo seed re-export.
 *
 * The canonical demo data lives alongside the Strimzi card in
 * `components/cards/strimzi_status/demoData.ts`. This file re-exports it
 * so callers outside the card folder (docs, tests, future drill-downs)
 * can import a stable demo seed from `lib/demo/strimzi`.
 */

export {
  STRIMZI_DEMO_DATA,
  type StrimziStatusData,
  type StrimziKafkaCluster,
  type StrimziTopic,
  type StrimziConsumerGroup,
  type StrimziStats,
  type StrimziSummary,
  type StrimziHealth,
  type ClusterHealth,
  type TopicStatus,
  type ConsumerGroupStatus,
} from '../../components/cards/strimzi_status/demoData'
