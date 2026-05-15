import { describe, it, expect } from 'vitest'
import {
  MISSION_RECONNECT_DELAY_MS,
  MISSION_RECONNECT_MAX_AGE_MS,
  MAX_RESENT_MESSAGES,
  WS_RECONNECT_INITIAL_DELAY_MS,
  WS_RECONNECT_MAX_DELAY_MS,
  WS_RECONNECT_MAX_RETRIES,
  WS_CONNECTION_TIMEOUT_MS,
  STATUS_WAITING_DELAY_MS,
  STATUS_PROCESSING_DELAY_MS,
  MISSION_TIMEOUT_MS,
  MISSION_TIMEOUT_CHECK_INTERVAL_MS,
  MISSION_INACTIVITY_TIMEOUT_MS,
  CANCEL_ACK_TIMEOUT_MS,
  CANCEL_ACK_MESSAGE_TYPE,
  CANCEL_CONFIRMED_MESSAGE_TYPE,
  WAITING_INPUT_TIMEOUT_MS,
  AGENT_DISCONNECT_ERROR_PATTERNS,
  WS_SEND_MAX_RETRIES,
  WS_SEND_RETRY_DELAY_MS,
  STREAM_GAP_THRESHOLD_MS,
} from '../useMissions.constants'

describe('useMissions.constants', () => {
  it('keeps reconnect and replay limits stable', () => {
    expect(MISSION_RECONNECT_DELAY_MS).toBe(500)
    expect(MISSION_RECONNECT_MAX_AGE_MS).toBe(1_800_000)
    expect(MAX_RESENT_MESSAGES).toBe(20)
  })

  it('keeps websocket retry/timeouts ordered', () => {
    expect(WS_RECONNECT_INITIAL_DELAY_MS).toBeLessThan(WS_RECONNECT_MAX_DELAY_MS)
    expect(WS_RECONNECT_MAX_RETRIES).toBe(10)
    expect(WS_CONNECTION_TIMEOUT_MS).toBe(5_000)
    expect(WS_SEND_MAX_RETRIES).toBe(3)
    expect(WS_SEND_RETRY_DELAY_MS).toBe(1_000)
  })

  it('keeps status and mission timeout constants stable', () => {
    expect(STATUS_WAITING_DELAY_MS).toBe(500)
    expect(STATUS_PROCESSING_DELAY_MS).toBe(3_000)
    expect(MISSION_TIMEOUT_MS).toBe(300_000)
    expect(MISSION_TIMEOUT_CHECK_INTERVAL_MS).toBe(15_000)
    expect(MISSION_INACTIVITY_TIMEOUT_MS).toBe(90_000)
    expect(WAITING_INPUT_TIMEOUT_MS).toBe(600_000)
  })

  it('defines cancel protocol message types', () => {
    expect(CANCEL_ACK_TIMEOUT_MS).toBe(10_000)
    expect(CANCEL_ACK_MESSAGE_TYPE).toBe('cancel_ack')
    expect(CANCEL_CONFIRMED_MESSAGE_TYPE).toBe('cancel_confirmed')
  })

  it('ships all disconnect patterns used by stale-message cleanup', () => {
    expect(AGENT_DISCONNECT_ERROR_PATTERNS).toEqual([
      'Local Agent Not Connected',
      'agent not available',
      'agent not responding',
    ])
  })

  it('keeps stream gap threshold stable', () => {
    expect(STREAM_GAP_THRESHOLD_MS).toBe(8_000)
  })
})
