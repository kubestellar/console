import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const emitFromLensViewed = vi.fn()
const emitFromLensActioned = vi.fn()
const emitFromLensTabSwitch = vi.fn()
const emitFromLensCommandCopy = vi.fn()
const emitFromHeadlampViewed = vi.fn()
const emitFromHeadlampActioned = vi.fn()
const emitFromHeadlampTabSwitch = vi.fn()
const emitFromHeadlampCommandCopy = vi.fn()

vi.mock('../../lib/analytics', () => ({
  emitFromLensViewed,
  emitFromLensActioned,
  emitFromLensTabSwitch,
  emitFromLensCommandCopy,
  emitFromHeadlampViewed,
  emitFromHeadlampActioned,
  emitFromHeadlampTabSwitch,
  emitFromHeadlampCommandCopy,
  emitInstallCommandCopied: vi.fn(),
}))

vi.mock('../../lib/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}))

import { FromLens } from '../FromLens'

describe('FromLens', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Lens copy and emits viewed event', () => {
    render(
      <MemoryRouter>
        <FromLens />
      </MemoryRouter>,
    )

    expect(screen.getByText('Lens?')).toBeInTheDocument()
    expect(screen.getByText('Lens does a lot of things right')).toBeInTheDocument()
    expect(emitFromLensViewed).toHaveBeenCalledTimes(1)
    expect(emitFromHeadlampViewed).not.toHaveBeenCalled()
  })

  it('keeps analytics wiring scoped to lens emitters', () => {
    render(
      <MemoryRouter>
        <FromLens />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByText('Try Demo Mode'))
    fireEvent.click(screen.getByText('Try Demo'))
    const githubLinks = screen.getAllByText('View on GitHub')
    fireEvent.click(githubLinks[0])
    fireEvent.click(githubLinks[1])
    fireEvent.click(screen.getAllByText('Cluster')[0])

    expect(emitFromLensActioned).toHaveBeenCalledWith('hero_try_demo')
    expect(emitFromLensActioned).toHaveBeenCalledWith('footer_try_demo')
    expect(emitFromLensActioned).toHaveBeenCalledWith('hero_view_github')
    expect(emitFromLensActioned).toHaveBeenCalledWith('footer_view_github')
    expect(emitFromLensTabSwitch).toHaveBeenCalledWith('cluster-portforward')

    expect(emitFromHeadlampActioned).not.toHaveBeenCalled()
    expect(emitFromHeadlampTabSwitch).not.toHaveBeenCalled()
    expect(emitFromHeadlampCommandCopy).not.toHaveBeenCalled()
  })
})
