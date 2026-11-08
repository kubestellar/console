import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClusterIssuesList } from '../ClusterIssuesList'
import type { PodIssue, DeploymentIssue } from '../../../hooks/mcp/types.workloads'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k }),
}))

const podIssue: PodIssue = {
  name: 'api-7f9c', namespace: 'prod', cluster: 'c1', status: 'CrashLoopBackOff', restarts: 3, issues: ['OOMKilled'],
}
const deploymentIssue: DeploymentIssue = {
  name: 'web', namespace: 'prod', cluster: 'c1', replicas: 3, readyReplicas: 1, reason: 'Unavailable', message: 'not ready',
}

describe('ClusterIssuesList keyboard navigation', () => {
  it('drills into pod and deployment issues with Enter and Space', async () => {
    const user = userEvent.setup()
    const onDrillToPod = vi.fn()
    const onDrillToDeployment = vi.fn()
    const onClose = vi.fn()
    render(
      <ClusterIssuesList
        podIssues={[podIssue]}
        deploymentIssues={[deploymentIssue]}
        clusterName="c1"
        onDrillToPod={onDrillToPod}
        onDrillToDeployment={onDrillToDeployment}
        onClose={onClose}
      />,
    )

    await user.tab()
    expect(screen.getByRole('button', { name: /api-7f9c/ })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onDrillToPod).toHaveBeenCalledWith('c1', 'prod', 'api-7f9c', expect.objectContaining({ status: 'CrashLoopBackOff' }))

    await user.tab()
    expect(screen.getByRole('button', { name: /web/ })).toHaveFocus()
    await user.keyboard('[Space]')
    expect(onDrillToDeployment).toHaveBeenCalledWith('c1', 'prod', 'web', expect.objectContaining({ readyReplicas: 1 }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
