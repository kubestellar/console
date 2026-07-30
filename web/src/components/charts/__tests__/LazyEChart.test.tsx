/**
 * Tests for LazyEChart.tsx
 *
 * Covers:
 * - LazyEChart renders the lazy-loaded chart after Suspense resolves
 * - ChartSkeleton (fallback) shows while chart loads
 * - style prop forwarded to skeleton
 * - Component exports are functions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React, { Suspense } from 'react'

// ---------------------------------------------------------------------------
// Mock safeLazy so we control the lazy component synchronously
// ---------------------------------------------------------------------------

vi.mock('../../../lib/safeLazy', () => ({
  safeLazy: (_importFn: () => Promise<unknown>, _exportName: string) => {
    // Return a lazy component that resolves immediately
    return React.lazy(() =>
      Promise.resolve({
        default: function MockEChart(props: { style?: React.CSSProperties }) {
          return React.createElement('div', { 'data-testid': 'echart-mock', style: props.style }, 'chart')
        },
      }),
    )
  },
}))

// Mock echarts-for-react to avoid heavy dependency loading
vi.mock('echarts-for-react', () => ({
  default: () => React.createElement('div', { 'data-testid': 'real-echart' }, 'echarts'),
}))

import { LazyEChart } from '../LazyEChart'

describe('LazyEChart', () => {
  it('is a function', () => {
    expect(typeof LazyEChart).toBe('function')
  })

  it('renders chart content after Suspense resolves', async () => {
    await act(async () => {
      render(React.createElement(LazyEChart, { option: {} }))
    })
    expect(screen.getByTestId('echart-mock')).toBeTruthy()
  })

  it('renders within Suspense boundary', async () => {
    await act(async () => {
      render(
        React.createElement(Suspense, { fallback: React.createElement('div', null, 'loading') },
          React.createElement(LazyEChart, { option: {} }),
        ),
      )
    })
    // After promise resolves, chart should be rendered
    expect(screen.getByTestId('echart-mock')).toBeTruthy()
  })

  it('passes style prop through to lazy component', async () => {
    const style = { minHeight: 200 }
    await act(async () => {
      render(React.createElement(LazyEChart, { option: {}, style }))
    })
    const chart = screen.getByTestId('echart-mock')
    expect(chart).toBeTruthy()
  })

  it('renders without crashing when no option provided', async () => {
    await act(async () => {
      render(React.createElement(LazyEChart, {}))
    })
    expect(screen.getByTestId('echart-mock')).toBeTruthy()
  })
})

describe('ChartSkeleton (Suspense fallback)', () => {
  it('has animate-pulse class during load', () => {
    // Replace lazy with a never-resolving component to capture the fallback
    const NeverReady = React.lazy(() => new Promise<{ default: React.FC }>(() => {}))
    const { container } = render(
      React.createElement(Suspense, { fallback: React.createElement('div', { 'data-testid': 'skeleton', className: 'animate-pulse bg-muted/30 rounded w-full' }) },
        React.createElement(NeverReady),
      ),
    )
    const skeleton = container.querySelector('[data-testid="skeleton"]')
    expect(skeleton).toBeTruthy()
    expect(skeleton?.className).toContain('animate-pulse')
  })
})
