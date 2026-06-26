import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ClusterCardSkeleton } from './ClusterCardSkeleton'

describe('ClusterCardSkeleton Component', () => {
  it('renders skeleton component', () => {
    const { container } = render(<ClusterCardSkeleton />)
    expect(container.querySelector('.glass')).toBeTruthy()
  })

  it('shows refresh indicator', () => {
    const { container } = render(<ClusterCardSkeleton />)
    const refreshIcon = container.querySelector('svg')
    expect(refreshIcon).toBeTruthy()
  })
})
