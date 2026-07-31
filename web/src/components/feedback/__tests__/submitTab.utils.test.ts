import type { WheelEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  ALL_CLUSTERS_CONTEXT_LABEL,
  DESCRIPTION_EDITOR_HEIGHT_CLASS,
  DESCRIPTION_EXAMPLE_MAX_HEIGHT_CLASS,
  MAX_AGENT_CONNECTION_LOG_LINES,
  MIN_PARENT_ISSUE_NUMBER,
  SCROLL_EDGE_TOLERANCE_PX,
  buildDirectIssueUrl,
  getSubmitErrorDetails,
  preventModalScrollChaining,
  splitDraftForIssue,
} from '../submitTab.utils'
import { MAX_TITLE_LENGTH } from '../FeatureRequestTypes'

describe('submitTab.utils constants', () => {
  it('exposes stable numeric and string constants', () => {
    expect(MIN_PARENT_ISSUE_NUMBER).toBe(1)
    expect(MAX_AGENT_CONNECTION_LOG_LINES).toBe(10)
    expect(ALL_CLUSTERS_CONTEXT_LABEL).toBe('all clusters')
    expect(DESCRIPTION_EDITOR_HEIGHT_CLASS).toBe('h-56')
    expect(DESCRIPTION_EXAMPLE_MAX_HEIGHT_CLASS).toBe('max-h-56')
    expect(SCROLL_EDGE_TOLERANCE_PX).toBe(1)
  })
})

describe('splitDraftForIssue', () => {
  it('returns empty title and body for empty input', () => {
    expect(splitDraftForIssue('')).toEqual({ title: '', body: '' })
  })

  it('treats whitespace-only input as empty', () => {
    expect(splitDraftForIssue('   \n\t  ')).toEqual({ title: '', body: '' })
  })

  it('uses the first line as the title when only one line is present', () => {
    expect(splitDraftForIssue('Just a title')).toEqual({
      title: 'Just a title',
      body: '',
    })
  })

  it('splits multiline drafts into title and body', () => {
    const draft = 'A short title\nDetail line 1\nDetail line 2'
    expect(splitDraftForIssue(draft)).toEqual({
      title: 'A short title',
      body: 'Detail line 1\nDetail line 2',
    })
  })

  it('trims the first line before returning it as the title', () => {
    expect(splitDraftForIssue('   spaced title   \nBody')).toEqual({
      title: 'spaced title',
      body: 'Body',
    })
  })

  it('trims the body after joining subsequent lines', () => {
    expect(splitDraftForIssue('Title\n\n  body with edges  \n\n')).toEqual({
      title: 'Title',
      body: 'body with edges',
    })
  })

  it('truncates the title to MAX_TITLE_LENGTH', () => {
    const longTitle = 'a'.repeat(MAX_TITLE_LENGTH + 50)
    const result = splitDraftForIssue(longTitle)
    expect(result.title).toHaveLength(MAX_TITLE_LENGTH)
    expect(result.title).toBe('a'.repeat(MAX_TITLE_LENGTH))
    expect(result.body).toBe('')
  })
})

describe('buildDirectIssueUrl', () => {
  it('routes to kubestellar/console for the console target', () => {
    const url = buildDirectIssueUrl('console', 'Title\nBody line')
    expect(url).toContain('https://github.com/kubestellar/console/issues/new')
    expect(url).toContain('title=Title')
    expect(url).toContain('body=Body+line')
  })

  it('routes to kubestellar/docs for the docs target', () => {
    const url = buildDirectIssueUrl('docs', 'Docs title')
    expect(url).toContain('https://github.com/kubestellar/docs/issues/new')
    expect(url).toContain('title=Docs+title')
  })

  it('produces a bare new-issue URL when the description is empty', () => {
    expect(buildDirectIssueUrl('console', '')).toBe(
      'https://github.com/kubestellar/console/issues/new',
    )
  })
})

describe('getSubmitErrorDetails', () => {
  const t = (_key: string, defaultValue?: string) => defaultValue ?? _key

  it('flags PAT permission errors and offers reauthentication when actions are allowed', () => {
    const details = getSubmitErrorDetails(
      'Resource not accessible by personal access token',
      true,
      t,
    )
    expect(details.action).toBe('reauthenticate')
    expect(details.message.toLowerCase()).toContain('re-authenticate')
    expect(details.guidance.toLowerCase()).toContain('reconnect')
  })

  it('falls back to setup guidance when actions are disallowed', () => {
    const details = getSubmitErrorDetails(
      'current token does not have permission to open issues in this repository',
      false,
      t,
    )
    expect(details.action).toBe('setup')
    expect(details.guidance).toBe('feedback.submitFailedGuidance')
  })

  it('flags GitHub 403 responses tied to create-github-issue as auth failures', () => {
    const details = getSubmitErrorDetails(
      'GitHub API returned 403 while attempting to create GitHub issue',
      true,
      t,
    )
    expect(details.action).toBe('reauthenticate')
  })

  it('does not flag a plain 403 without the create-issue phrase as auth-related', () => {
    const details = getSubmitErrorDetails('GitHub API returned 403 fetching stuff', true, t)
    expect(details.action).toBeNull()
    expect(details.message).toBe('GitHub API returned 403 fetching stuff')
  })

  it('returns the raw error message and default guidance for generic failures with actions', () => {
    const details = getSubmitErrorDetails('Network error', true, t)
    expect(details).toEqual({
      message: 'Network error',
      guidance: 'feedback.submitFailedGuidance',
      action: null,
    })
  })

  it('returns setup action for generic failures when actions are disallowed', () => {
    const details = getSubmitErrorDetails('Network error', false, t)
    expect(details.action).toBe('setup')
    expect(details.message).toBe('Network error')
  })

  it('matches auth errors case-insensitively', () => {
    const details = getSubmitErrorDetails(
      'RESOURCE NOT ACCESSIBLE BY PERSONAL ACCESS TOKEN',
      true,
      t,
    )
    expect(details.action).toBe('reauthenticate')
  })
})

describe('preventModalScrollChaining', () => {
  function makeEvent(overrides: {
    scrollTop: number
    scrollHeight: number
    clientHeight: number
    deltaY: number
  }): WheelEvent<HTMLElement> {
    const stopPropagation = vi.fn()
    const currentTarget = {
      scrollTop: overrides.scrollTop,
      scrollHeight: overrides.scrollHeight,
      clientHeight: overrides.clientHeight,
    } as HTMLElement
    return {
      currentTarget,
      deltaY: overrides.deltaY,
      stopPropagation,
    } as unknown as WheelEvent<HTMLElement>
  }

  it('does nothing when content is not scrollable', () => {
    const event = makeEvent({ scrollTop: 0, scrollHeight: 100, clientHeight: 100, deltaY: 10 })
    preventModalScrollChaining(event)
    expect(event.stopPropagation).not.toHaveBeenCalled()
  })

  it('does not stop propagation when scrolling down at the bottom edge', () => {
    const event = makeEvent({ scrollTop: 400, scrollHeight: 500, clientHeight: 100, deltaY: 20 })
    preventModalScrollChaining(event)
    expect(event.stopPropagation).not.toHaveBeenCalled()
  })

  it('does not stop propagation when scrolling up at the top edge', () => {
    const event = makeEvent({ scrollTop: 0, scrollHeight: 500, clientHeight: 100, deltaY: -20 })
    preventModalScrollChaining(event)
    expect(event.stopPropagation).not.toHaveBeenCalled()
  })

  it('stops propagation when scrolling down away from the bottom', () => {
    const event = makeEvent({ scrollTop: 100, scrollHeight: 500, clientHeight: 100, deltaY: 20 })
    preventModalScrollChaining(event)
    expect(event.stopPropagation).toHaveBeenCalledTimes(1)
  })

  it('stops propagation when scrolling up away from the top', () => {
    const event = makeEvent({ scrollTop: 100, scrollHeight: 500, clientHeight: 100, deltaY: -20 })
    preventModalScrollChaining(event)
    expect(event.stopPropagation).toHaveBeenCalledTimes(1)
  })

  it('treats the top edge as anywhere within the tolerance', () => {
    const event = makeEvent({
      scrollTop: SCROLL_EDGE_TOLERANCE_PX,
      scrollHeight: 500,
      clientHeight: 100,
      deltaY: -5,
    })
    preventModalScrollChaining(event)
    expect(event.stopPropagation).not.toHaveBeenCalled()
  })

  it('treats the bottom edge as anywhere within the tolerance', () => {
    const event = makeEvent({
      scrollTop: 500 - 100 - SCROLL_EDGE_TOLERANCE_PX,
      scrollHeight: 500,
      clientHeight: 100,
      deltaY: 5,
    })
    preventModalScrollChaining(event)
    expect(event.stopPropagation).not.toHaveBeenCalled()
  })
})
