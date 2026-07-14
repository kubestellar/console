import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const emitPageView = vi.fn()

vi.mock('../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/analytics')>()),
  emitPageView: (...args: unknown[]) => emitPageView(...args),
}))

import { FeatureKagent } from './FeatureKagent'

function renderPage() {
  return render(
    <MemoryRouter>
      <FeatureKagent />
    </MemoryRouter>,
  )
}

describe('FeatureKagent', () => {
  it('emits a page_view analytics event on mount', () => {
    emitPageView.mockClear()
    renderPage()
    expect(emitPageView).toHaveBeenCalled()
  })

  it('renders the "How it works" section with all four steps', () => {
    renderPage()
    expect(screen.getByText(/how it works/i)).toBeInTheDocument()
    expect(screen.getByText(/Install kagent in your cluster/i)).toBeInTheDocument()
    expect(screen.getByText(/Define agents with CRDs/i)).toBeInTheDocument()
    expect(screen.getByText(/Console auto-detects kagent/i)).toBeInTheDocument()
  })

  it('links back to a route from the config/routes module', () => {
    renderPage()
    const anchors = screen.getAllByRole('link')
    expect(anchors.length).toBeGreaterThan(0)
  })
})
