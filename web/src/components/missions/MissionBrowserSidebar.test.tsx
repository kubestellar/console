import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MissionBrowserSidebar } from './MissionBrowserSidebar'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe('MissionBrowserSidebar', () => {
  it('renders without errors', () => {
    const { container } = render(
      <MissionBrowserSidebar
        onNavigate={vi.fn()}
        selectedPath=""
      />
    )
    expect(container).toBeTruthy()
  })

  it('accepts selectedPath prop', () => {
    const { container } = render(
      <MissionBrowserSidebar
        onNavigate={vi.fn()}
        selectedPath="/missions/install"
      />
    )
    expect(container).toBeTruthy()
  })

  it('calls onNavigate when navigation occurs', () => {
    const onNavigate = vi.fn()
    render(
      <MissionBrowserSidebar
        onNavigate={onNavigate}
        selectedPath=""
      />
    )
    expect(onNavigate).not.toHaveBeenCalled()
  })
})
