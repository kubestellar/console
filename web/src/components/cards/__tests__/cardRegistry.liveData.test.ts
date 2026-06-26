import { describe, expect, it } from 'vitest'
import { LIVE_DATA_CARDS } from '../cardRegistry'

describe('LIVE_DATA_CARDS', () => {
  it('includes event stream cards that render real-time event data', () => {
    expect(LIVE_DATA_CARDS.has('event_stream')).toBe(true)
    expect(LIVE_DATA_CARDS.has('events_timeline')).toBe(true)
  })
})
