import React from 'react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/demoMode', () => ({
  isNetlifyDeployment: false,
  getDemoMode: () => false,
  hasRealToken: () => false,
}))

vi.mock('../../lib/utils/localStorage', () => ({
  safeGetItem: () => null,
  safeSetItem: vi.fn(),
}))

vi.mock('../../lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../setup/SetupInstructionsDialog', () => ({
  SetupInstructionsDialog: () => null,
}))

import { DemoToLocalCTA } from './DemoToLocalCTA'

describe('DemoToLocalCTA Component', () => {
  it('exports DemoToLocalCTA component', () => {
    expect(DemoToLocalCTA).toBeDefined()
    expect(typeof DemoToLocalCTA).toBe('function')
  })
})
