import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PodStatusSection } from '../PodStatusSection'

describe('PodStatusSection', () => {
  it('shows the fetching state', () => {
    render(<PodStatusSection agentConnected podName="demo-pod" namespace="demo" output={null} loading error={null} fetchingLabel="Fetching pod status" />)
    expect(screen.getByText('Fetching pod status')).toBeVisible()
  })

  it('shows kubectl output when available', () => {
    render(<PodStatusSection agentConnected podName="demo-pod" namespace="demo" output="demo-pod 1/1 Running" loading={false} error={null} fetchingLabel="Fetching pod status" />)
    expect(screen.getByText('# kubectl get pod demo-pod -n demo -o wide')).toBeInTheDocument()
    expect(screen.getByText('demo-pod 1/1 Running')).toBeVisible()
  })
})
