import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { FeatureInspektorGadget } from './FeatureInspektorGadget'

function renderPage() {
  return render(
    <MemoryRouter>
      <FeatureInspektorGadget />
    </MemoryRouter>,
  )
}

describe('FeatureInspektorGadget', () => {
  it('renders the card catalog with the main trace categories', () => {
    renderPage()
    expect(screen.getByText(/Network Trace/i)).toBeInTheDocument()
    expect(screen.getByText(/DNS Trace/i)).toBeInTheDocument()
  })

  it('surfaces the underlying tool names for each card entry', () => {
    renderPage()
    expect(screen.getByText(/trace_tcp/)).toBeInTheDocument()
    expect(screen.getByText(/trace_dns/)).toBeInTheDocument()
  })

  it('renders at least one navigation link', () => {
    renderPage()
    expect(screen.getAllByRole('link').length).toBeGreaterThan(0)
  })
})
