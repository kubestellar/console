import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const analyticsMocks = vi.hoisted(() => ({
  emitFromHeadlampViewed: vi.fn(),
  emitFromHeadlampActioned: vi.fn(),
  emitFromHeadlampTabSwitch: vi.fn(),
  emitFromHeadlampCommandCopy: vi.fn(),
  emitFromLensViewed: vi.fn(),
  emitFromLensActioned: vi.fn(),
  emitFromLensTabSwitch: vi.fn(),
  emitFromLensCommandCopy: vi.fn(),
}))

const {
  emitFromHeadlampViewed,
  emitFromHeadlampActioned,
  emitFromHeadlampTabSwitch,
  emitFromHeadlampCommandCopy,
  emitFromLensViewed,
  emitFromLensActioned,
  emitFromLensTabSwitch,
  emitFromLensCommandCopy,
} = analyticsMocks

vi.mock('../../lib/analytics', () => ({
  ...analyticsMocks,
  emitInstallCommandCopied: vi.fn(),
}))

vi.mock('../../lib/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}))

import { FromHeadlamp } from '../FromHeadlamp'

describe('FromHeadlamp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Headlamp copy and emits viewed event', () => {
    render(
      <MemoryRouter>
        <FromHeadlamp />
      </MemoryRouter>,
    )

    expect(screen.getByText('Headlamp?')).toBeInTheDocument()
    expect(screen.getByText('Headlamp does a lot of things right')).toBeInTheDocument()
    expect(emitFromHeadlampViewed).toHaveBeenCalledTimes(1)
    expect(emitFromLensViewed).not.toHaveBeenCalled()
  })

  it('keeps analytics wiring scoped to headlamp emitters', () => {
    render(
      <MemoryRouter>
        <FromHeadlamp />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByText('Try Demo Mode'))
    fireEvent.click(screen.getByText('Try Demo'))
    const githubLinks = screen.getAllByText('View on GitHub')
    fireEvent.click(githubLinks[0])
    fireEvent.click(githubLinks[1])
    fireEvent.click(screen.getAllByText('Cluster')[0])

    expect(emitFromHeadlampActioned).toHaveBeenCalledWith('hero_try_demo')
    expect(emitFromHeadlampActioned).toHaveBeenCalledWith('footer_try_demo')
    expect(emitFromHeadlampActioned).toHaveBeenCalledWith('hero_view_github')
    expect(emitFromHeadlampActioned).toHaveBeenCalledWith('footer_view_github')
    expect(emitFromHeadlampTabSwitch).toHaveBeenCalledWith('cluster-portforward')

    expect(emitFromLensActioned).not.toHaveBeenCalled()
    expect(emitFromLensTabSwitch).not.toHaveBeenCalled()
    expect(emitFromLensCommandCopy).not.toHaveBeenCalled()
  })
})
