import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/dynamic-cards', () => ({
  saveDynamicCard: vi.fn(),
}))

vi.mock('../../lib/dynamic-cards/compiler', () => ({
  compileCardCode: vi.fn(),
}))

vi.mock('../../lib/ai/prompts', () => ({
  CARD_T1_SYSTEM_PROMPT: 'prompt',
  CARD_T2_SYSTEM_PROMPT: 'prompt',
}))

vi.mock('./cardFactoryPreviews', () => ({
  T1Preview: () => null,
  T2Preview: () => null,
}))

import { AiCardTab } from './cardFactoryAiTab'

describe('AiCardTab Component', () => {
  it('exports AiCardTab component', () => {
    expect(AiCardTab).toBeDefined()
    expect(typeof AiCardTab).toBe('function')
  })

  it('renders with onCardCreated callback', () => {
    expect(() => {
      AiCardTab({ onCardCreated: vi.fn() })
    }).not.toThrow()
  })
})
