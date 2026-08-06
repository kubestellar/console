import { describe, it, expect, vi } from "vitest"
import { render } from "@testing-library/react"

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
    initReactI18next: { type: '3rdParty', init: () => {} },
  }
})

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
  ApiKeyPromptModal: () => null,
}))

import { InlineAIAssist } from './InlineAIAssist'

describe('InlineAIAssist Component', () => {
  it('exports InlineAIAssist component', () => {
    expect(InlineAIAssist).toBeDefined()
    expect(typeof InlineAIAssist).toBe('function')
  })

  it('renders with required props', () => {
    expect(() => render(<InlineAIAssist {...{
        systemPrompt: 'Test prompt',
        placeholder: 'Enter text',
        onResult: vi.fn(),
      }} />)).not.toThrow()
  })
})
