import { describe, it, expect } from 'vitest'
import {
  STRIMZI_DEMO_DATA,
  type StrimziHealth,
  type ClusterHealth,
  type TopicStatus,
  type ConsumerGroupStatus,
} from '../strimzi_status/demoData'

describe('STRIMZI_DEMO_DATA', () => {
  it('is defined', () => {
    expect(STRIMZI_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const validHealth: StrimziHealth[] = ['healthy', 'degraded', 'not-installed', 'unknown']
    expect(validHealth).toContain(STRIMZI_DEMO_DATA.health)
  })

  it('has clusters array with entries', () => {
    expect(Array.isArray(STRIMZI_DEMO_DATA.clusters)).toBe(true)
    expect(STRIMZI_DEMO_DATA.clusters.length).toBeGreaterThan(0)
  })

  it('each cluster has required fields', () => {
    const validClusterHealth: ClusterHealth[] = ['healthy', 'degraded', 'unavailable']
    for (const kc of STRIMZI_DEMO_DATA.clusters) {
      expect(typeof kc.name).toBe('string')
      expect(typeof kc.namespace).toBe('string')
      expect(typeof kc.cluster).toBe('string')
      expect(typeof kc.kafkaVersion).toBe('string')
      expect(validClusterHealth).toContain(kc.health)
      expect(typeof kc.brokers.ready).toBe('number')
      expect(typeof kc.brokers.total).toBe('number')
      expect(kc.brokers.ready).toBeLessThanOrEqual(kc.brokers.total)
    }
  })

  it('each cluster has topics array', () => {
    const validTopicStatus: TopicStatus[] = ['active', 'inactive', 'error']
    for (const kc of STRIMZI_DEMO_DATA.clusters) {
      expect(Array.isArray(kc.topics)).toBe(true)
      for (const topic of kc.topics) {
        expect(typeof topic.name).toBe('string')
        expect(typeof topic.partitions).toBe('number')
        expect(typeof topic.replicationFactor).toBe('number')
        expect(validTopicStatus).toContain(topic.status)
      }
    }
  })

  it('each cluster has consumerGroups array', () => {
    const validCgStatus: ConsumerGroupStatus[] = ['ok', 'warning', 'error']
    for (const kc of STRIMZI_DEMO_DATA.clusters) {
      expect(Array.isArray(kc.consumerGroups)).toBe(true)
      for (const cg of kc.consumerGroups) {
        expect(typeof cg.groupId).toBe('string')
        expect(typeof cg.members).toBe('number')
        expect(typeof cg.lag).toBe('number')
        expect(validCgStatus).toContain(cg.status)
      }
    }
  })

  it('has stats with required numeric fields', () => {
    expect(typeof STRIMZI_DEMO_DATA.stats.clusterCount).toBe('number')
    expect(typeof STRIMZI_DEMO_DATA.stats.brokerCount).toBe('number')
    expect(typeof STRIMZI_DEMO_DATA.stats.topicCount).toBe('number')
    expect(typeof STRIMZI_DEMO_DATA.stats.consumerGroupCount).toBe('number')
    expect(typeof STRIMZI_DEMO_DATA.stats.totalLag).toBe('number')
    expect(typeof STRIMZI_DEMO_DATA.stats.operatorVersion).toBe('string')
  })

  it('has summary with required fields', () => {
    expect(typeof STRIMZI_DEMO_DATA.summary.totalClusters).toBe('number')
    expect(typeof STRIMZI_DEMO_DATA.summary.healthyClusters).toBe('number')
    expect(typeof STRIMZI_DEMO_DATA.summary.totalBrokers).toBe('number')
    expect(typeof STRIMZI_DEMO_DATA.summary.readyBrokers).toBe('number')
  })
})
