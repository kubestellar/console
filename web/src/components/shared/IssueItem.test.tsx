import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IssueItem, type PodIssue, type DeploymentIssue } from './IssueItem'

const podIssue: PodIssue = {
  kind: 'Pod',
  name: 'my-pod',
  namespace: 'default',
  status: 'CrashLoopBackOff',
  restarts: 5,
  issues: ['OOMKilled', 'Liveness probe failed'],
}

const deploymentIssue: DeploymentIssue = {
  kind: 'Deployment',
  name: 'my-deploy',
  namespace: 'prod',
  replicas: 3,
  readyReplicas: 1,
  message: 'progress deadline exceeded',
}

describe('IssueItem', () => {
  it('renders the collapsed summary row for a pod issue', () => {
    render(<IssueItem issue={podIssue} isExpanded={false} onToggle={vi.fn()} />)

    expect(screen.getByText('my-pod')).toBeVisible()
    expect(screen.getByText('(default)')).toBeVisible()
    expect(screen.getByText('CrashLoopBackOff')).toBeVisible()
    expect(screen.queryByText('OOMKilled')).not.toBeInTheDocument()
  })

  it('renders the ready/replicas summary for a deployment issue', () => {
    render(<IssueItem issue={deploymentIssue} isExpanded={false} onToggle={vi.fn()} />)

    expect(screen.getByText('my-deploy')).toBeVisible()
    expect(screen.getByText('1/3 common.ready')).toBeVisible()
  })

  it('calls onToggle when the summary row is clicked', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(<IssueItem issue={podIssue} isExpanded={false} onToggle={onToggle} />)

    await user.click(screen.getByText('my-pod'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('shows expanded pod details, including restart count and issue list', () => {
    render(<IssueItem issue={podIssue} isExpanded={true} onToggle={vi.fn()} />)

    expect(screen.getByText('5')).toBeVisible()
    expect(screen.getByText('OOMKilled')).toBeVisible()
    expect(screen.getByText('Liveness probe failed')).toBeVisible()
  })

  it('shows the deployment message and replicas info when expanded', () => {
    render(<IssueItem issue={deploymentIssue} isExpanded={true} onToggle={vi.fn()} />)

    expect(screen.getByText('progress deadline exceeded')).toBeVisible()
    expect(screen.getByText('shared.issueItem.replicasReady')).toBeVisible()
  })

  it('renders view details and troubleshoot buttons and fires their callbacks', async () => {
    const onViewDetails = vi.fn()
    const onTroubleshoot = vi.fn()
    const user = userEvent.setup()
    render(
      <IssueItem
        issue={podIssue}
        isExpanded={true}
        onToggle={vi.fn()}
        onViewDetails={onViewDetails}
        onTroubleshoot={onTroubleshoot}
      />
    )

    await user.click(screen.getByText('common.viewDetails'))
    expect(onViewDetails).toHaveBeenCalledTimes(1)

    await user.click(screen.getByText('shared.issueItem.troubleshoot'))
    expect(onTroubleshoot).toHaveBeenCalledTimes(1)
  })

  it('omits action buttons when their callbacks are not provided', () => {
    render(<IssueItem issue={podIssue} isExpanded={true} onToggle={vi.fn()} />)

    expect(screen.queryByText('common.viewDetails')).not.toBeInTheDocument()
    expect(screen.queryByText('shared.issueItem.troubleshoot')).not.toBeInTheDocument()
  })
})
