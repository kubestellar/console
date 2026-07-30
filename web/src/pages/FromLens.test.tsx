import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const capturedProps: Array<Record<string, unknown>> = []

vi.mock('../components/landing/CompetitorLandingPage', () => ({
  CompetitorLandingPage: (props: Record<string, unknown>) => {
    capturedProps.push(props)
    return <div data-testid="competitor-landing-page" data-competitor={String(props.competitorName)} />
  },
}))

vi.mock('../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/analytics')>()),
  emitFromLensViewed: vi.fn(),
  emitFromLensActioned: vi.fn(),
  emitFromLensTabSwitch: vi.fn(),
  emitFromLensCommandCopy: vi.fn(),
}))

import { FromLens } from './FromLens'
import {
  emitFromLensViewed,
  emitFromLensActioned,
  emitFromLensTabSwitch,
  emitFromLensCommandCopy,
} from '../lib/analytics'

describe('FromLens', () => {
  it('renders the CompetitorLandingPage with Lens branding and analytics wired up', () => {
    capturedProps.length = 0

    render(
      <MemoryRouter>
        <FromLens />
      </MemoryRouter>,
    )

    const el = screen.getByTestId('competitor-landing-page')
    expect(el).toHaveAttribute('data-competitor', 'Lens')

    expect(capturedProps).toHaveLength(1)
    const props = capturedProps[0]
    expect(props.accentColor).toBe('purple')
    expect(props.analyticsSource).toBe('from_lens')
    expect(props.onViewed).toBe(emitFromLensViewed)
    expect(props.onActioned).toBe(emitFromLensActioned)
    expect(props.onTabSwitch).toBe(emitFromLensTabSwitch)
    expect(props.onCommandCopy).toBe(emitFromLensCommandCopy)
    expect(Array.isArray(props.highlights)).toBe(true)
    expect((props.highlights as unknown[]).length).toBeGreaterThan(0)
    expect(Array.isArray(props.comparisonRows)).toBe(true)
    expect((props.comparisonRows as unknown[]).length).toBeGreaterThan(0)
    expect(Array.isArray(props.localhostSteps)).toBe(true)
    expect(Array.isArray(props.portForwardSteps)).toBe(true)
    expect(Array.isArray(props.ingressSteps)).toBe(true)
  })
})
