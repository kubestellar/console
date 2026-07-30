import { describe, it, expect } from 'vitest'
import {
  CAPABILITY_CHAT,
  CAPABILITY_TOOL_EXEC,
} from '../analytics-types'

describe('analytics-types constants', () => {
  it('CAPABILITY_CHAT is bitmask value 1', () => {
    expect(CAPABILITY_CHAT).toBe(1)
  })

  it('CAPABILITY_TOOL_EXEC is bitmask value 2', () => {
    expect(CAPABILITY_TOOL_EXEC).toBe(2)
  })

  it('capabilities are distinct bits (no overlap)', () => {
    expect(CAPABILITY_CHAT & CAPABILITY_TOOL_EXEC).toBe(0)
  })

  it('capabilities can be combined with bitwise OR', () => {
    const both = CAPABILITY_CHAT | CAPABILITY_TOOL_EXEC
    expect(both & CAPABILITY_CHAT).toBe(CAPABILITY_CHAT)
    expect(both & CAPABILITY_TOOL_EXEC).toBe(CAPABILITY_TOOL_EXEC)
  })
})
