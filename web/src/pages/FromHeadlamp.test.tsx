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
  emitFromHeadlampViewed: vi.fn(),
  emitFromHeadlampActioned: vi.fn(),
  emitFromHeadlampTabSwitch: vi.fn(),
  emitFromHeadlampCommandCopy: vi.fn(),
}))

import { FromHeadlamp } from './FromHeadlamp'
import {
  emitFromHeadlampViewed,
  emitFromHeadlampActioned,
  emitFromHeadlampTabSwitch,
  emitFromHeadlampCommandCopy,
} from '../lib/analytics'

describe('FromHeadlamp', () => {
  it('renders the CompetitorLandingPage with Headlamp branding and analytics wired up', () => {
    capturedProps.length = 0

    render(
      <MemoryRouter>
        <FromHeadlamp />
      </MemoryRouter>,
    )

    const el = screen.getByTestId('competitor-landing-page')
    expect(el).toHaveAttribute('data-competitor', 'Headlamp')

    expect(capturedProps).toHaveLength(1)
    const props = capturedProps[0]
    expect(props.accentColor).toBe('teal')
    expect(props.analyticsSource).toBe('from_headlamp')
    expect(props.competitorSubtitle).toBe('(CNCF Sandbox)')
    expect(props.onViewed).toBe(emitFromHeadlampViewed)
    expect(props.onActioned).toBe(emitFromHeadlampActioned)
    expect(props.onTabSwitch).toBe(emitFromHeadlampTabSwitch)
    expect(props.onCommandCopy).toBe(emitFromHeadlampCommandCopy)
    expect(Array.isArray(props.highlights)).toBe(true)
    expect((props.highlights as unknown[]).length).toBeGreaterThan(0)
    expect(Array.isArray(props.comparisonRows)).toBe(true)
    expect((props.comparisonRows as unknown[]).length).toBeGreaterThan(0)
    expect(Array.isArray(props.localhostSteps)).toBe(true)
    expect(Array.isArray(props.portForwardSteps)).toBe(true)
    expect(Array.isArray(props.ingressSteps)).toBe(true)
  })
})
