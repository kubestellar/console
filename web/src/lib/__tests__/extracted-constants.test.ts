import { describe, it, expect } from 'vitest'
import {
  DEFAULT_API_FETCH_LIMIT,
  DEFAULT_DISPLAY_LIMIT,
  UNBOUNDED_ITEMS_PER_PAGE,
  EVENT_STREAM_FOOTER_MIN_HEIGHT_PX,
} from '../../components/cards/EventStream'
import { TOKENS_PER_K } from '../../components/settings/sections/AgentSection'
import {
  MAX_WILDCARD_ROLES,
  MAX_NAMESPACE_PREVIEW,
  RUN_AS_NON_ROOT_WARNING_THRESHOLD,
  READ_ONLY_ROOT_WARNING_THRESHOLD,
  LATEST_TAG_WARNING_THRESHOLD,
  MIN_SECRET_VALUE_LENGTH,
} from '../../hooks/useCachedISO27001'
import {
  GITHUB_MAIN_SHA_TIMEOUT_MS,
  RECENT_COMMITS_LIMIT,
} from '../../hooks/version/useReleasesFetch'
import {
  DEFAULT_FLASH_THRESHOLD_RATIO,
  DEFAULT_FLASH_COOLDOWN_MS,
} from '../cards/cardFlash'
import {
  DEFAULT_TOP_N,
  PREFETCH_IDLE_TIMEOUT_MS,
} from '../dashboardVisits'

describe('src/components/cards/EventStream.tsx', () => {
  it('exports the extracted numeric constants', () => {
    expect(DEFAULT_API_FETCH_LIMIT).toBe(100)
    expect(DEFAULT_DISPLAY_LIMIT).toBe(5)
    expect(UNBOUNDED_ITEMS_PER_PAGE).toBe(1000)
    expect(EVENT_STREAM_FOOTER_MIN_HEIGHT_PX).toBe(48)
  })
})

describe('src/components/settings/sections/AgentSection.tsx', () => {
  it('exports the extracted numeric constants', () => {
    expect(TOKENS_PER_K).toBe(1000)
  })
})

describe('src/hooks/useCachedISO27001.ts', () => {
  it('exports the extracted numeric constants', () => {
    expect(MAX_WILDCARD_ROLES).toBe(2)
    expect(MAX_NAMESPACE_PREVIEW).toBe(3)
    expect(RUN_AS_NON_ROOT_WARNING_THRESHOLD).toBe(3)
    expect(READ_ONLY_ROOT_WARNING_THRESHOLD).toBe(5)
    expect(LATEST_TAG_WARNING_THRESHOLD).toBe(2)
    expect(MIN_SECRET_VALUE_LENGTH).toBe(20)
  })
})

describe('src/hooks/version/useReleasesFetch.ts', () => {
  it('exports the extracted numeric constants', () => {
    expect(GITHUB_MAIN_SHA_TIMEOUT_MS).toBe(5000)
    expect(RECENT_COMMITS_LIMIT).toBe(20)
  })
})

describe('src/lib/cards/cardFlash.ts', () => {
  it('exports the extracted numeric constants', () => {
    expect(DEFAULT_FLASH_THRESHOLD_RATIO).toBe(0.1)
    expect(DEFAULT_FLASH_COOLDOWN_MS).toBe(5000)
  })
})

describe('src/lib/dashboardVisits.ts', () => {
  it('exports the extracted numeric constants', () => {
    expect(DEFAULT_TOP_N).toBe(5)
    expect(PREFETCH_IDLE_TIMEOUT_MS).toBe(3000)
  })
})
