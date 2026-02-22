import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  ClusterStatusBadge,
  ClusterStatusDot,
  getClusterState,
} from './ClusterStatusBadge'

describe('ClusterStatusBadge Component', () => {
  it('exports ClusterStatusBadge component', () => {
    expect(ClusterStatusBadge).toBeDefined()
    expect(typeof ClusterStatusBadge).toBe('function')
  })

  it('renders healthy badge with correct label', () => {
    const { getByText } = render(<ClusterStatusBadge state="healthy" />)
    expect(getByText('Healthy')).toBeTruthy()
  })

  it('renders degraded badge with correct label', () => {
    const { getByText } = render(<ClusterStatusBadge state="degraded" />)
    expect(getByText('Degraded')).toBeTruthy()
  })

  it('renders unreachable-timeout badge with Offline label', () => {
    const { getByText } = render(<ClusterStatusBadge state="unreachable-timeout" />)
    expect(getByText('Offline')).toBeTruthy()
  })

  it('renders unreachable-auth badge with Auth Error label', () => {
    const { getByText } = render(<ClusterStatusBadge state="unreachable-auth" />)
    expect(getByText('Auth Error')).toBeTruthy()
  })

  it('renders unreachable-network badge with Network Error label', () => {
    const { getByText } = render(<ClusterStatusBadge state="unreachable-network" />)
    expect(getByText('Network Error')).toBeTruthy()
  })

  it('renders unreachable-cert badge with Cert Error label', () => {
    const { getByText } = render(<ClusterStatusBadge state="unreachable-cert" />)
    expect(getByText('Cert Error')).toBeTruthy()
  })

  it('renders unreachable-unknown badge with Offline label', () => {
    const { getByText } = render(<ClusterStatusBadge state="unreachable-unknown" />)
    expect(getByText('Offline')).toBeTruthy()
  })

  it('applies green color classes for healthy state', () => {
    const { container } = render(<ClusterStatusBadge state="healthy" />)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain('text-green-400')
    expect(badge.className).toContain('bg-green-500/10')
  })

  it('applies yellow color classes for degraded state', () => {
    const { container } = render(<ClusterStatusBadge state="degraded" />)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain('text-yellow-400')
  })

  it('applies red color classes for auth error state', () => {
    const { container } = render(<ClusterStatusBadge state="unreachable-auth" />)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain('text-red-400')
  })

  it('has role="status" for accessibility', () => {
    const { container } = render(<ClusterStatusBadge state="healthy" />)
    const badge = container.firstChild as HTMLElement
    expect(badge.getAttribute('role')).toBe('status')
  })

  it('has aria-label containing cluster status', () => {
    const { container } = render(<ClusterStatusBadge state="healthy" />)
    const badge = container.firstChild as HTMLElement
    const ariaLabel = badge.getAttribute('aria-label') ?? ''
    expect(ariaLabel).toContain('Cluster status')
    expect(ariaLabel).toContain('Healthy')
  })

  it('sets title attribute for tooltip', () => {
    const { container } = render(<ClusterStatusBadge state="healthy" />)
    const badge = container.firstChild as HTMLElement
    expect(badge.getAttribute('title')).toContain('Healthy')
  })

  it('includes suggestion in title for unreachable states', () => {
    const { container } = render(<ClusterStatusBadge state="unreachable-auth" />)
    const badge = container.firstChild as HTMLElement
    const title = badge.getAttribute('title') ?? ''
    expect(title).toContain('Suggestion:')
  })

  it('shows node ratio in label when degraded with node counts', () => {
    const { getByText } = render(
      <ClusterStatusBadge state="degraded" nodeCount={5} readyNodes={3} />
    )
    expect(getByText('3/5 ready')).toBeTruthy()
  })

  it('includes node ratio in title tooltip for degraded state', () => {
    const { container } = render(
      <ClusterStatusBadge state="degraded" nodeCount={5} readyNodes={3} />
    )
    const badge = container.firstChild as HTMLElement
    const title = badge.getAttribute('title') ?? ''
    expect(title).toContain('3/5 nodes ready')
  })

  it('includes lastSeen in title for unreachable states', () => {
    const { container } = render(
      <ClusterStatusBadge state="unreachable-timeout" lastSeen="2024-01-01T00:00:00Z" />
    )
    const badge = container.firstChild as HTMLElement
    const title = badge.getAttribute('title') ?? ''
    expect(title).toContain('Last seen:')
  })

  it('hides label text when showLabel is false', () => {
    const { container } = render(
      <ClusterStatusBadge state="healthy" showLabel={false} />
    )
    const spans = container.querySelectorAll('span')
    // Only the outer badge span; no inner text span
    const hasLabelText = Array.from(spans).some(
      (s) => s.textContent === 'Healthy'
    )
    expect(hasLabelText).toBe(false)
  })

  it('applies custom className', () => {
    const { container } = render(
      <ClusterStatusBadge state="healthy" className="my-custom-class" />
    )
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain('my-custom-class')
  })

  it('renders an icon (svg) inside the badge', () => {
    const { container } = render(<ClusterStatusBadge state="healthy" />)
    const icon = container.querySelector('svg')
    expect(icon).toBeTruthy()
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
  })

  it('applies sm size classes by default', () => {
    const { container } = render(<ClusterStatusBadge state="healthy" />)
    const icon = container.querySelector('svg')
    expect(icon?.getAttribute('class')).toContain('w-3')
  })

  it('applies md size classes when size="md"', () => {
    const { container } = render(<ClusterStatusBadge state="healthy" size="md" />)
    const icon = container.querySelector('svg')
    expect(icon?.getAttribute('class')).toContain('w-4')
  })
})

describe('ClusterStatusDot Component', () => {
  it('exports ClusterStatusDot component', () => {
    expect(ClusterStatusDot).toBeDefined()
    expect(typeof ClusterStatusDot).toBe('function')
  })

  it('renders a span with role="status"', () => {
    const { container } = render(<ClusterStatusDot state="healthy" />)
    const dot = container.firstChild as HTMLElement
    expect(dot.tagName.toLowerCase()).toBe('span')
    expect(dot.getAttribute('role')).toBe('status')
  })

  it('has aria-label containing status for healthy', () => {
    const { container } = render(<ClusterStatusDot state="healthy" />)
    const dot = container.firstChild as HTMLElement
    expect(dot.getAttribute('aria-label')).toContain('Healthy')
  })

  it('applies green background for healthy state', () => {
    const { container } = render(<ClusterStatusDot state="healthy" />)
    const dot = container.firstChild as HTMLElement
    expect(dot.className).toContain('bg-green-500')
  })

  it('applies orange background for degraded state', () => {
    const { container } = render(<ClusterStatusDot state="degraded" />)
    const dot = container.firstChild as HTMLElement
    expect(dot.className).toContain('bg-orange-500')
  })

  it('applies yellow background for unreachable states', () => {
    const { container } = render(<ClusterStatusDot state="unreachable-timeout" />)
    const dot = container.firstChild as HTMLElement
    expect(dot.className).toContain('bg-yellow-500')
  })

  it('applies custom className', () => {
    const { container } = render(
      <ClusterStatusDot state="healthy" className="extra-class" />
    )
    const dot = container.firstChild as HTMLElement
    expect(dot.className).toContain('extra-class')
  })
})

describe('getClusterState helper', () => {
  it('returns healthy when healthy=true and all nodes ready', () => {
    expect(getClusterState(true, true, 3, 3)).toBe('healthy')
  })

  it('returns healthy when healthy=true and no node counts provided', () => {
    expect(getClusterState(true)).toBe('healthy')
  })

  it('returns degraded when healthy=true but not all nodes ready', () => {
    expect(getClusterState(true, true, 5, 3)).toBe('degraded')
  })

  it('returns degraded when healthy=false and reachable', () => {
    expect(getClusterState(false, true)).toBe('degraded')
  })

  it('returns unreachable-timeout when reachable=false and errorType=timeout', () => {
    expect(getClusterState(false, false, undefined, undefined, 'timeout')).toBe(
      'unreachable-timeout'
    )
  })

  it('returns unreachable-auth when reachable=false and errorType=auth', () => {
    expect(getClusterState(false, false, undefined, undefined, 'auth')).toBe(
      'unreachable-auth'
    )
  })

  it('returns unreachable-network when reachable=false and errorType=network', () => {
    expect(getClusterState(false, false, undefined, undefined, 'network')).toBe(
      'unreachable-network'
    )
  })

  it('returns unreachable-cert when reachable=false and errorType=certificate', () => {
    expect(getClusterState(false, false, undefined, undefined, 'certificate')).toBe(
      'unreachable-cert'
    )
  })

  it('returns unreachable-unknown when reachable=false and no errorType', () => {
    expect(getClusterState(false, false)).toBe('unreachable-unknown')
  })

  it('returns degraded when healthy=undefined and reachable', () => {
    expect(getClusterState(undefined, true)).toBe('degraded')
  })
})
