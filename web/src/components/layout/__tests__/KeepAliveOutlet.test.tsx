/**
 * KeepAliveOutlet Component Tests
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, Routes, Route} from 'react-router-dom'

vi.mock('../Layout', () => ({
  ContentLoadingSkeleton: () => <div data-testid="loading-skeleton">Loading...</div>,
}))

vi.mock('../../ChunkErrorBoundary', () => ({
  ChunkErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../PageErrorBoundary', () => ({
  PageErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe('KeepAliveOutlet', () => {
  it('exports KeepAliveOutlet component', async () => {
    const mod = await import('../KeepAliveOutlet')
    expect(mod.KeepAliveOutlet).toBeDefined()
    expect(typeof mod.KeepAliveOutlet).toBe('function')
  })

  it('renders within a router context', async () => {
    const { KeepAliveOutlet } = await import('../KeepAliveOutlet')
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<KeepAliveOutlet />}>
            <Route path="/" element={<div>Home</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    )
    expect(container).toBeTruthy()
  })
})
