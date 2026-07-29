import { describe, it, expect, vi } from 'vitest'
import type { WheelEvent } from 'react'
import {
  splitDraftForIssue,
  getSubmitErrorDetails,
  buildDirectIssueUrl,
  preventModalScrollChaining,
  MIN_PARENT_ISSUE_NUMBER,
  MAX_AGENT_CONNECTION_LOG_LINES,
  ALL_CLUSTERS_CONTEXT_LABEL,
  SCROLL_EDGE_TOLERANCE_PX,
} from '../submitTab.utils'
import {
  MAX_TITLE_LENGTH,
  MIN_DRAFT_LENGTH,
  MIN_TITLE_LENGTH,
  MIN_DESCRIPTION_LENGTH,
  MIN_DESCRIPTION_WORDS,
  FEEDBACK_ATTACHMENT_MAX_FILE_BYTES,
  FEEDBACK_REQUEST_BODY_LIMIT_BYTES,
  BYTES_PER_MEBIBYTE,
  MAX_VIDEO_SIZE_MIB,
  ACCEPTED_VIDEO_MIME_TYPES,
  estimateFeedbackRequestBodyBytes,
  isFeedbackRequestBodyTooLarge,
  isFeedbackRequestBodyLimitError,
  getStatusInfo,
} from '../FeatureRequestTypes'

// ─── submitTab.utils constants ───────────────────────────────────────────────

describe('submitTab.utils constants', () => {
  it('MIN_PARENT_ISSUE_NUMBER is 1', () => {
    expect(MIN_PARENT_ISSUE_NUMBER).toBe(1)
  })

  it('MAX_AGENT_CONNECTION_LOG_LINES is 10', () => {
    expect(MAX_AGENT_CONNECTION_LOG_LINES).toBe(10)
  })

  it('ALL_CLUSTERS_CONTEXT_LABEL is "all clusters"', () => {
    expect(ALL_CLUSTERS_CONTEXT_LABEL).toBe('all clusters')
  })

  it('SCROLL_EDGE_TOLERANCE_PX is 1', () => {
    expect(SCROLL_EDGE_TOLERANCE_PX).toBe(1)
  })
})

// ─── splitDraftForIssue ──────────────────────────────────────────────────────

describe('splitDraftForIssue', () => {
  it('returns empty title and body for empty string', () => {
    expect(splitDraftForIssue('')).toEqual({ title: '', body: '' })
    expect(splitDraftForIssue('   ')).toEqual({ title: '', body: '' })
  })

  it('uses first line as title, rest as body', () => {
    const result = splitDraftForIssue('My title\nFirst paragraph\nSecond paragraph')
    expect(result.title).toBe('My title')
    expect(result.body).toBe('First paragraph\nSecond paragraph')
  })

  it('truncates title to MAX_TITLE_LENGTH', () => {
    const longTitle = 'A'.repeat(300)
    const result = splitDraftForIssue(longTitle)
    expect(result.title.length).toBe(MAX_TITLE_LENGTH)
  })

  it('returns empty body when only one line', () => {
    const result = splitDraftForIssue('Single line title')
    expect(result.title).toBe('Single line title')
    expect(result.body).toBe('')
  })

  it('trims whitespace from title and body', () => {
    const result = splitDraftForIssue('  Title with spaces  \n  Body content  ')
    expect(result.title).toBe('Title with spaces')
    expect(result.body).toBe('Body content')
  })
})

// ─── getSubmitErrorDetails ───────────────────────────────────────────────────

describe('getSubmitErrorDetails', () => {
  const t = (key: string, defaultValue?: string) => defaultValue || key

  it('detects GitHub permission denied (resource not accessible)', () => {
    const result = getSubmitErrorDetails(
      'Resource not accessible by personal access token',
      true,
      t,
    )
    expect(result.action).toBe('reauthenticate')
    expect(result.message).toContain('permission')
  })

  it('detects GitHub permission denied (token does not have permission)', () => {
    const result = getSubmitErrorDetails(
      'Current token does not have permission to open issues in this repository',
      true,
      t,
    )
    expect(result.action).toBe('reauthenticate')
  })

  it('detects GitHub 403 with create issue context', () => {
    const result = getSubmitErrorDetails(
      'GitHub API returned 403 while trying to create GitHub issue',
      true,
      t,
    )
    expect(result.action).toBe('reauthenticate')
  })

  it('returns setup action when canPerformActions is false', () => {
    const result = getSubmitErrorDetails(
      'Resource not accessible by personal access token',
      false,
      t,
    )
    expect(result.action).toBe('setup')
  })

  it('returns generic error for non-permission errors', () => {
    const result = getSubmitErrorDetails('Network timeout', true, t)
    expect(result.message).toBe('Network timeout')
    expect(result.action).toBeNull()
  })

  it('returns setup action for generic error when canPerformActions is false', () => {
    const result = getSubmitErrorDetails('Some error', false, t)
    expect(result.action).toBe('setup')
  })
})

// ─── FeatureRequestTypes constants ───────────────────────────────────────────

describe('FeatureRequestTypes constants', () => {
  it('MAX_TITLE_LENGTH is 200', () => {
    expect(MAX_TITLE_LENGTH).toBe(200)
  })

  it('MIN_DRAFT_LENGTH is 5', () => {
    expect(MIN_DRAFT_LENGTH).toBe(5)
  })

  it('MIN_TITLE_LENGTH is 10', () => {
    expect(MIN_TITLE_LENGTH).toBe(10)
  })

  it('MIN_DESCRIPTION_LENGTH is 20', () => {
    expect(MIN_DESCRIPTION_LENGTH).toBe(20)
  })

  it('MIN_DESCRIPTION_WORDS is 3', () => {
    expect(MIN_DESCRIPTION_WORDS).toBe(3)
  })

  it('MAX_VIDEO_SIZE_MIB is 10', () => {
    expect(MAX_VIDEO_SIZE_MIB).toBe(10)
  })

  it('FEEDBACK_ATTACHMENT_MAX_FILE_BYTES equals 10 MiB', () => {
    expect(FEEDBACK_ATTACHMENT_MAX_FILE_BYTES).toBe(10 * BYTES_PER_MEBIBYTE)
  })

  it('FEEDBACK_REQUEST_BODY_LIMIT_BYTES is larger than attachment max', () => {
    expect(FEEDBACK_REQUEST_BODY_LIMIT_BYTES).toBeGreaterThan(FEEDBACK_ATTACHMENT_MAX_FILE_BYTES)
  })

  it('ACCEPTED_VIDEO_MIME_TYPES has mp4, webm, quicktime', () => {
    expect(ACCEPTED_VIDEO_MIME_TYPES.has('video/mp4')).toBe(true)
    expect(ACCEPTED_VIDEO_MIME_TYPES.has('video/webm')).toBe(true)
    expect(ACCEPTED_VIDEO_MIME_TYPES.has('video/quicktime')).toBe(true)
    expect(ACCEPTED_VIDEO_MIME_TYPES.size).toBe(3)
  })
})

// ─── estimateFeedbackRequestBodyBytes ────────────────────────────────────────

describe('estimateFeedbackRequestBodyBytes', () => {
  it('returns byte length of JSON-serialized payload', () => {
    const payload = { title: 'hello', body: 'world' }
    const expected = new TextEncoder().encode(JSON.stringify(payload)).length
    expect(estimateFeedbackRequestBodyBytes(payload)).toBe(expected)
  })

  it('handles empty object', () => {
    expect(estimateFeedbackRequestBodyBytes({})).toBe(2) // '{}'
  })

  it('handles multi-byte characters', () => {
    const payload = { emoji: '🎉🚀' }
    const result = estimateFeedbackRequestBodyBytes(payload)
    // Multi-byte chars are larger in UTF-8
    expect(result).toBeGreaterThan(JSON.stringify(payload).length)
  })
})

// ─── isFeedbackRequestBodyTooLarge ───────────────────────────────────────────

describe('isFeedbackRequestBodyTooLarge', () => {
  it('returns false for small payloads', () => {
    expect(isFeedbackRequestBodyTooLarge({ title: 'test' })).toBe(false)
  })

  it('returns true for payloads exceeding limit', () => {
    // Create a payload larger than FEEDBACK_REQUEST_BODY_LIMIT_BYTES
    const largeString = 'x'.repeat(FEEDBACK_REQUEST_BODY_LIMIT_BYTES + 1000)
    expect(isFeedbackRequestBodyTooLarge({ data: largeString })).toBe(true)
  })
})

// ─── isFeedbackRequestBodyLimitError ─────────────────────────────────────────

describe('isFeedbackRequestBodyLimitError', () => {
  it('detects "request entity too large"', () => {
    expect(isFeedbackRequestBodyLimitError('Request Entity Too Large')).toBe(true)
  })

  it('detects "request body too large"', () => {
    expect(isFeedbackRequestBodyLimitError('Error: request body too large for server')).toBe(true)
  })

  it('detects "payload too large"', () => {
    expect(isFeedbackRequestBodyLimitError('413 Payload Too Large')).toBe(true)
  })

  it('returns false for unrelated errors', () => {
    expect(isFeedbackRequestBodyLimitError('Network timeout')).toBe(false)
    expect(isFeedbackRequestBodyLimitError('404 Not Found')).toBe(false)
  })
})

// ─── getStatusInfo ───────────────────────────────────────────────────────────

describe('getStatusInfo', () => {
  it('returns correct info for open status', () => {
    const result = getStatusInfo('open')
    expect(result.color).toContain('blue')
    expect(result.bgColor).toContain('blue')
  })

  it('returns correct info for fix_complete', () => {
    const result = getStatusInfo('fix_complete')
    expect(result.color).toContain('green')
  })

  it('returns correct info for closed status', () => {
    const result = getStatusInfo('closed')
    expect(result.label).toBeDefined()
  })

  it('shows "Closed by You" when closedByUser is true', () => {
    const result = getStatusInfo('closed', true)
    expect(result.label).toBe('Closed by You')
  })

  it('returns muted color for closed status', () => {
    const result = getStatusInfo('closed')
    expect(result.color).toContain('muted')
  })

  it('returns yellow for needs_triage', () => {
    const result = getStatusInfo('needs_triage')
    expect(result.color).toContain('yellow')
  })

  it('returns purple for feasibility_study', () => {
    const result = getStatusInfo('feasibility_study')
    expect(result.color).toContain('purple')
  })
})
buildDirectIssueUrl // ─── ──────────────────────────

describe('buildDirectIssueUrl', () => {
  it('targets kubestellar/console when targetRepo is not docs', () => {
    const url = buildDirectIssueUrl('console', 'My title\nSome body')
    expect(url).toContain('github.com/kubestellar/console/issues/new')
  })

  it('targets kubestellar/docs when targetRepo is docs', () => {
    const url = buildDirectIssueUrl('docs', 'Docs title\nDocs body')
    expect(url).toContain('github.com/kubestellar/docs/issues/new')
  })

  it('URL-encodes the title from the first line of the draft', () => {
    const url = new URL(buildDirectIssueUrl('console', 'Hello world\nBody paragraph'))
    expect(url.searchParams.get('title')).toBe('Hello world')
    expect(url.searchParams.get('body')).toBe('Body paragraph')
  })

  it('omits title/body params for empty description', () => {
    const url = new URL(buildDirectIssueUrl('console', ''))
    // URLSearchParams from empty query has no title/body keys
    expect(url.searchParams.get('title')).toBeNull()
    expect(url.searchParams.get('body')).toBeNull()
  })

  it('produces empty body when only one line is supplied', () => {
    const url = new URL(buildDirectIssueUrl('console', 'Only a title'))
    expect(url.searchParams.get('title')).toBe('Only a title')
    expect(url.searchParams.get('body')).toBeNull()
  })
})

preventModalScrollChaining // ─── ─────────────────────────────

function makeWheelEvent(opts: {
  deltaY: number
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}): WheelEvent<HTMLElement> & { _stopped: boolean } {
  const stopPropagation = vi.fn()
  const target = {
    scrollTop: opts.scrollTop,
    scrollHeight: opts.scrollHeight,
    clientHeight: opts.clientHeight,
  } as HTMLElement
  return {
    deltaY: opts.deltaY,
    currentTarget: target,
    stopPropagation,
    get _stopped() {
      return stopPropagation.mock.calls.length > 0
    },
  } as unknown as WheelEvent<HTMLElement> & { _stopped: boolean }
}

describe('preventModalScrollChaining', () => {
  it('is a no-op when content fits (scrollHeight <= clientHeight)', () => {
    const ev = makeWheelEvent({ deltaY: 100, scrollTop: 0, scrollHeight: 200, clientHeight: 200 })
    preventModalScrollChaining(ev)
    expect(ev._stopped).toBe(false)
  })

  it('stops propagation when scrolling down and not at the bottom', () => {
    const ev = makeWheelEvent({ deltaY: 50, scrollTop: 100, scrollHeight: 1000, clientHeight: 400 })
    preventModalScrollChaining(ev)
    expect(ev._stopped).toBe(true)
  })

  it('does NOT stop propagation when scrolling down and already at the bottom (edge tolerance)', () => {
    const ev = makeWheelEvent({ deltaY: 50, scrollTop: 599, scrollHeight: 1000, clientHeight: 400 })
    preventModalScrollChaining(ev)
    expect(ev._stopped).toBe(false)
  })

  it('stops propagation when scrolling up and not at the top', () => {
    const ev = makeWheelEvent({ deltaY: -50, scrollTop: 300, scrollHeight: 1000, clientHeight: 400 })
    preventModalScrollChaining(ev)
    expect(ev._stopped).toBe(true)
  })

  it('does NOT stop propagation when scrolling up and already at the top (edge tolerance)', () => {
    const ev = makeWheelEvent({ deltaY: -50, scrollTop: 1, scrollHeight: 1000, clientHeight: 400 })
    preventModalScrollChaining(ev)
    expect(ev._stopped).toBe(false)
  })

  it('respects SCROLL_EDGE_TOLERANCE_PX at the top boundary', () => {
    const withinTolerance = makeWheelEvent({
      deltaY: -1,
      scrollTop: SCROLL_EDGE_TOLERANCE_PX,
      scrollHeight: 1000,
      clientHeight: 400,
    })
    preventModalScrollChaining(withinTolerance)
    expect(withinTolerance._stopped).toBe(false)

    const outsideTolerance = makeWheelEvent({
      deltaY: -1,
      scrollTop: SCROLL_EDGE_TOLERANCE_PX + 1,
      scrollHeight: 1000,
      clientHeight: 400,
    })
    preventModalScrollChaining(outsideTolerance)
    expect(outsideTolerance._stopped).toBe(true)
  })
})
