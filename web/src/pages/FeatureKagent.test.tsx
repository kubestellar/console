import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/config/routes', () => ({
  ROUTES: { HOME: '/', SETTINGS: '/settings' },
}))

const analyticsMocks = vi.hoisted(() => ({
  emitPageView: vi.fn(),
}))

vi.mock('@/lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/analytics')>()),
  emitPageView: analyticsMocks.emitPageView,
}))

import { FeatureKagent } from './FeatureKagent'

describe('FeatureKagent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    document.title = ''
  })

  it('renders the Kagent hero heading', () => {
    render(
      <MemoryRouter>
        <FeatureKagent />
      </MemoryRouter>,
    )
    expect(screen.getByText('Kagent')).toBeInTheDocument()
  })

  it('renders the CNCF Sandbox badge', () => {
    render(
      <MemoryRouter>
        <FeatureKagent />
      </MemoryRouter>,
    )
    expect(screen.getByText('CNCF Sandbox Project')).toBeInTheDocument()
  })

  it('calls emitPageView with /feature-kagent on mount', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <FeatureKagent />
        </MemoryRouter>,
      )
    })
    expect(analyticsMocks.emitPageView).toHaveBeenCalledWith('/feature-kagent')
    expect(analyticsMocks.emitPageView).toHaveBeenCalledTimes(1)
  })

  it('sets document.title on mount', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <FeatureKagent />
        </MemoryRouter>,
      )
    })
    expect(document.title).toBe('KubeStellar Console — Kagent Integration')
  })

  it('renders the How the integration works section', () => {
    render(
      <MemoryRouter>
        <FeatureKagent />
      </MemoryRouter>,
    )
    expect(screen.getByText('How the integration works')).toBeInTheDocument()
  })

  it('renders the Capabilities section', () => {
    render(
      <MemoryRouter>
        <FeatureKagent />
      </MemoryRouter>,
    )
    expect(screen.getByText('Capabilities')).toBeInTheDocument()
  })

  it('renders all capability cards', () => {
    render(
      <MemoryRouter>
        <FeatureKagent />
      </MemoryRouter>,
    )
    expect(screen.getByText('Agent Chat via A2A')).toBeInTheDocument()
    expect(screen.getByText('253+ Kubernetes Tools')).toBeInTheDocument()
    expect(screen.getByText('No Local Agent Required')).toBeInTheDocument()
    expect(screen.getByText('Multi-Agent Orchestration')).toBeInTheDocument()
    expect(screen.getByText('Lifecycle Management')).toBeInTheDocument()
  })

  it('renders the Configure Kagent CTA', () => {
    render(
      <MemoryRouter>
        <FeatureKagent />
      </MemoryRouter>,
    )
    expect(screen.getByText('Configure Kagent')).toBeInTheDocument()
  })
})
