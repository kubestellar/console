/**
 * Observability Card Config Tests
 *
 * Tests observability and monitoring card configurations.
 */
import { describe, it, expect } from 'vitest'
import { cortexStatusConfig } from '../cortex-status'
import { otelStatusConfig } from '../otel-status'
import { drasiReactiveGraphConfig } from '../drasi-reactive-graph'
import { eventStreamConfig } from '../event-stream'
import { eventsTimelineConfig } from '../events-timeline'
import { eventSummaryConfig } from '../event-summary'
import { namespaceEventsConfig } from '../namespace-events'

const observabilityCards = [
  { name: 'cortexStatus', config: cortexStatusConfig },
  { name: 'otelStatus', config: otelStatusConfig },
  { name: 'drasiReactiveGraph', config: drasiReactiveGraphConfig },
  { name: 'eventStream', config: eventStreamConfig },
  { name: 'eventsTimeline', config: eventsTimelineConfig },
  { name: 'eventSummary', config: eventSummaryConfig },
  { name: 'namespaceEvents', config: namespaceEventsConfig },
]

describe('Observability card configs', () => {
  it.each(observabilityCards)('$name has valid structure', ({ config }) => {
    expect(config.type).toBeTruthy()
    expect(config.title).toBeTruthy()
    expect(config.category).toBeTruthy()
    expect(config.content).toBeDefined()
    expect(config.dataSource).toBeDefined()
  })

  it.each(observabilityCards)('$name has valid dimensions', ({ config }) => {
    expect(config.defaultWidth).toBeGreaterThan(0)
    expect(config.defaultHeight).toBeGreaterThan(0)
  })

  it.each(observabilityCards)('$name has icon', ({ config }) => {
    expect(config.icon).toBeTruthy()
  })

  it.each(observabilityCards)('$name type is not undefined or null', ({ config }) => {
    expect(config.type).not.toBeUndefined()
    expect(config.type).not.toBeNull()
  })
})
