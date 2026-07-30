import React from 'react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../hooks/useMissions', () => ({
  useMissions: () => ({
    startMission: vi.fn(),
    missions: [],
    closeSidebar: vi.fn(),
  }),
}))

vi.mock('../../hooks/useAIMode', () => ({
  useAIMode: () => ({
    mode: 'high',
    isFeatureEnabled: () => true,
  }),
}))

vi.mock('../cards/console-missions/shared', () => ({
  useApiKeyCheck: () => ({
    showKeyPrompt: false,
    checkKeyAndRun: vi.fn(),
  }),
}))

import { InlineAIAssist } from './InlineAIAssist'

describe('InlineAIAssist Component', () => {
  it('exports InlineAIAssist component', () => {
    expect(InlineAIAssist).toBeDefined()
    expect(typeof InlineAIAssist).toBe('function')
  })

  it('renders with required props', () => {
    expect(() => {
      InlineAIAssist({
        systemPrompt: 'Test prompt',
        placeholder: 'Enter text',
        onResult: vi.fn(),
      })
    }).not.toThrow()
  })
})
