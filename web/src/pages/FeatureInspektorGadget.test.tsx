import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/config/routes', () => ({
  ROUTES: { HOME: '/', SETTINGS: '/settings' },
}))

import { FeatureInspektorGadget } from './FeatureInspektorGadget'

describe('FeatureInspektorGadget', () => {
  afterEach(() => {
    document.title = ''
  })

  it('renders the hero headline', () => {
    render(
      <MemoryRouter>
        <FeatureInspektorGadget />
      </MemoryRouter>,
    )
    expect(screen.getByText(/eBPF observability/)).toBeInTheDocument()
  })

  it('renders the Inspektor Gadget badge', () => {
    render(
      <MemoryRouter>
        <FeatureInspektorGadget />
      </MemoryRouter>,
    )
    expect(screen.getByText('Powered by Inspektor Gadget')).toBeInTheDocument()
  })

  it('renders the dashboard cards section heading', () => {
    render(
      <MemoryRouter>
        <FeatureInspektorGadget />
      </MemoryRouter>,
    )
    expect(screen.getByText('Dashboard cards powered by eBPF')).toBeInTheDocument()
  })

  it('renders the how-it-works section', () => {
    render(
      <MemoryRouter>
        <FeatureInspektorGadget />
      </MemoryRouter>,
    )
    expect(screen.getByText('How the integration works')).toBeInTheDocument()
  })

  it('renders all four eBPF data cards', () => {
    render(
      <MemoryRouter>
        <FeatureInspektorGadget />
      </MemoryRouter>,
    )
    expect(screen.getByText('Network Trace')).toBeInTheDocument()
    expect(screen.getByText('DNS Trace')).toBeInTheDocument()
    expect(screen.getByText('Process Trace')).toBeInTheDocument()
    expect(screen.getByText('Security Audit')).toBeInTheDocument()
  })

  it('sets document.title on mount', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <FeatureInspektorGadget />
        </MemoryRouter>,
      )
    })
    expect(document.title).toBe('KubeStellar Console — Inspektor Gadget Integration')
  })

  it('renders the See it in action CTA link', () => {
    render(
      <MemoryRouter>
        <FeatureInspektorGadget />
      </MemoryRouter>,
    )
    expect(screen.getByText('See it in action')).toBeInTheDocument()
  })
})
