import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { ResolutionHistoryPanel } from './ResolutionHistoryPanel'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: [] }),
  },
}))

describe('ResolutionHistoryPanel', () => {
  it('renders without errors', () => {
    const { container } = render(
      <ResolutionHistoryPanel
        onSelectResolution={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })

  it('accepts onSelectResolution callback', () => {
    const onSelectResolution = vi.fn()
    render(
      <ResolutionHistoryPanel
        onSelectResolution={onSelectResolution}
      />
    )
    expect(onSelectResolution).not.toHaveBeenCalled()
  })
})
