import { describe, expect, it } from 'vitest'

import {
  BYTES_PER_MEBIBYTE,
  FEEDBACK_ATTACHMENT_MAX_FILE_BYTES,
  FEEDBACK_REQUEST_BODY_LIMIT_BYTES,
  MAX_VIDEO_SIZE_BYTES,
  MAX_VIDEO_SIZE_MIB,
  estimateFeedbackRequestBodyBytes,
  getStatusInfo,
  isFeedbackRequestBodyLimitError,
  isFeedbackRequestBodyTooLarge,
} from '../FeatureRequestTypes'

describe('feedback size constants', () => {
  it('BYTES_PER_MEBIBYTE is 1 MiB', () => {
    expect(BYTES_PER_MEBIBYTE).toBe(1024 * 1024)
  })

  it('MAX_VIDEO_SIZE_MIB=10 and MAX_VIDEO_SIZE_BYTES equal FEEDBACK_ATTACHMENT_MAX_FILE_BYTES', () => {
    expect(MAX_VIDEO_SIZE_MIB).toBe(10)
    expect(MAX_VIDEO_SIZE_BYTES).toBe(10 * BYTES_PER_MEBIBYTE)
    expect(MAX_VIDEO_SIZE_BYTES).toBe(FEEDBACK_ATTACHMENT_MAX_FILE_BYTES)
  })

  it('FEEDBACK_REQUEST_BODY_LIMIT_BYTES exceeds the raw attachment cap after base64 expansion', () => {
    // Base64 expands ~4/3× and the module adds a 1 MiB slack, so the limit
    // must be strictly larger than the raw attachment cap.
    expect(FEEDBACK_REQUEST_BODY_LIMIT_BYTES).toBeGreaterThan(FEEDBACK_ATTACHMENT_MAX_FILE_BYTES)
    const expected =
      Math.ceil(FEEDBACK_ATTACHMENT_MAX_FILE_BYTES / 3) * 4 + BYTES_PER_MEBIBYTE
    expect(FEEDBACK_REQUEST_BODY_LIMIT_BYTES).toBe(expected)
  })
})

describe('estimateFeedbackRequestBodyBytes', () => {
  it('returns the UTF-8 byte length of the JSON serialization', () => {
    expect(estimateFeedbackRequestBodyBytes('abc')).toBe(new TextEncoder().encode('"abc"').length)
    expect(estimateFeedbackRequestBodyBytes({ a: 1 })).toBe(new TextEncoder().encode('{"a":1}').length)
  })

  it('counts multi-byte UTF-8 characters correctly', () => {
    const emoji = '😀'
    const bytes = estimateFeedbackRequestBodyBytes(emoji)
    // JSON.stringify wraps in quotes; emoji is a surrogate pair → 4 UTF-8 bytes + 2 quotes.
    expect(bytes).toBe(6)
  })

  it('returns 0-adjacent length for null/undefined payloads', () => {
    // JSON.stringify(undefined) → undefined; TextEncoder → empty
    expect(estimateFeedbackRequestBodyBytes(undefined)).toBe(0)
    // JSON.stringify(null) → 'null'
    expect(estimateFeedbackRequestBodyBytes(null)).toBe(4)
  })
})

describe('isFeedbackRequestBodyTooLarge', () => {
  it('is false for small payloads', () => {
    expect(isFeedbackRequestBodyTooLarge({ title: 'hi', body: 'small' })).toBe(false)
  })

  it('is true for payloads larger than the request-body limit', () => {
    // Construct a string whose JSON encoding exceeds the limit. The +100
    // cushion accounts for JSON's surrounding quotes.
    const oversized = 'x'.repeat(FEEDBACK_REQUEST_BODY_LIMIT_BYTES + 100)
    expect(isFeedbackRequestBodyTooLarge(oversized)).toBe(true)
  })
})

describe('isFeedbackRequestBodyLimitError', () => {
  it.each([
    'Request entity too large',
    'request body too large',
    'PAYLOAD TOO LARGE for upload',
    'HTTP 413: request entity too large.',
  ])('matches known "too large" phrasing (%s)', (msg) => {
    expect(isFeedbackRequestBodyLimitError(msg)).toBe(true)
  })

  it.each([
    '',
    'timeout',
    'unrelated error',
    'entity too small',
  ])('does not match unrelated errors (%s)', (msg) => {
    expect(isFeedbackRequestBodyLimitError(msg)).toBe(false)
  })
})

describe('getStatusInfo', () => {
  it('returns a label and color/bgColor pair for open', () => {
    const info = getStatusInfo('open')
    expect(info.label.length).toBeGreaterThan(0)
    expect(info.color).toContain('blue')
    expect(info.bgColor).toContain('blue')
  })

  it('overrides closed label to "Closed by You" when closedByUser=true', () => {
    expect(getStatusInfo('closed', true).label).toBe('Closed by You')
  })

  it('does NOT override the label for non-closed statuses even if closedByUser=true', () => {
    const info = getStatusInfo('open', true)
    expect(info.label).not.toBe('Closed by You')
  })

  it('uses the default closed label when closedByUser is false/omitted', () => {
    const info = getStatusInfo('closed')
    expect(info.label).not.toBe('Closed by You')
    expect(info.color).toBe('text-muted-foreground')
  })

  it.each([
    ['needs_triage', 'yellow'],
    ['triage_accepted', 'cyan'],
    ['feasibility_study', 'purple'],
    ['fix_ready', 'green'],
    ['fix_complete', 'green'],
    ['unable_to_fix', 'orange'],
  ] as const)('maps %s to a %s color', (status, color) => {
    const info = getStatusInfo(status)
    expect(info.color).toContain(color)
    expect(info.bgColor).toContain(color)
  })
})
