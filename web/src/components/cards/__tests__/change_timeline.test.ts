import { describe, it, expect } from 'vitest'
import {
  getDemoTimelineEvents,
  type TimelineEvent,
  type TimelineEventType,
} from '../change_timeline/demoData'

describe('getDemoTimelineEvents', () => {
  let events: TimelineEvent[]

  beforeEach(() => {
    events = getDemoTimelineEvents()
  })

  it('returns a non-empty array', () => {
    expect(Array.isArray(events)).toBe(true)
    expect(events.length).toBeGreaterThan(0)
  })

  it('each event has required fields', () => {
    const validTypes: TimelineEventType[] = [
      'Created', 'Modified', 'Deleted', 'Scaled', 'Restarted', 'Failed', 'Warning',
    ]
    for (const evt of events) {
      expect(typeof evt.id).toBe('string')
      expect(evt.id.length).toBeGreaterThan(0)
      expect(typeof evt.cluster).toBe('string')
      expect(typeof evt.namespace).toBe('string')
      expect(typeof evt.resource).toBe('string')
      expect(validTypes).toContain(evt.eventType)
      expect(typeof evt.timestamp).toBe('string')
      expect(new Date(evt.timestamp).getTime()).toBeGreaterThan(0)
      expect(typeof evt.message).toBe('string')
    }
  })

  it('timestamps are within the last 24 hours', () => {
    const now = Date.now()
    const msInDay = 24 * 60 * 60 * 1000
    for (const evt of events) {
      const ts = new Date(evt.timestamp).getTime()
      expect(ts).toBeGreaterThan(now - msInDay * 2)
      expect(ts).toBeLessThanOrEqual(now + 1000)
    }
  })

  it('covers multiple event types', () => {
    const types = new Set(events.map(e => e.eventType))
    expect(types.size).toBeGreaterThan(1)
  })

  it('covers multiple clusters', () => {
    const clusters = new Set(events.map(e => e.cluster))
    expect(clusters.size).toBeGreaterThan(1)
  })

  it('all event IDs are unique', () => {
    const ids = events.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('calling twice returns consistent shape', () => {
    const events2 = getDemoTimelineEvents()
    expect(events2.length).toBe(events.length)
    expect(events2[0].cluster).toBe(events[0].cluster)
  })
})
