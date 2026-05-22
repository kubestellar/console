import { describe, expect, it } from 'vitest'
import {
  truncateMissionTextAtWordBoundary,
} from './missionChatUtils'
import {
  MISSION_HEADER_DESCRIPTION_PREVIEW_LENGTH,
  MISSION_HEADER_TITLE_PREVIEW_LENGTH,
} from './missionChatConstants'

describe('truncateMissionTextAtWordBoundary', () => {
  it('returns the original text when it already fits', () => {
    const text = 'Install Alertmanager'

    expect(truncateMissionTextAtWordBoundary(text, MISSION_HEADER_TITLE_PREVIEW_LENGTH)).toEqual({
      text,
      isTruncated: false,
    })
  })

  it('truncates on a word boundary and appends an ellipsis', () => {
    const text = 'Alertmanager is a key component of the Prometheus ecosystem that handles alerts sent by client applications. It manages alert deduplication, grouping, and routing to various notification channels.'

    expect(truncateMissionTextAtWordBoundary(text, MISSION_HEADER_DESCRIPTION_PREVIEW_LENGTH)).toEqual({
      text: 'Alertmanager is a key component of the Prometheus ecosystem that handles alerts sent by client applications. It manages alert…',
      isTruncated: true,
    })
  })

  it('falls back to a hard truncation when no whitespace is available', () => {
    expect(truncateMissionTextAtWordBoundary('Supercalifragilisticexpialidocious', 10)).toEqual({
      text: 'Supercali…',
      isTruncated: true,
    })
  })
})
