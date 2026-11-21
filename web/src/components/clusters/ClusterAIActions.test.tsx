import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClusterAIActions } from './ClusterAIActions'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

function setup(overrides: Partial<Parameters<typeof ClusterAIActions>[0]> = {}) {
  const props = {
    isUnreachable: false,
    podIssuesCount: 0,
    deploymentIssuesCount: 0,
    onDiagnose: vi.fn(),
    onRepair: vi.fn(),
    onAsk: vi.fn(),
    ...overrides,
  }
  render(<ClusterAIActions {...props} />)
  const button = (label: string) => screen.getByText(label).closest('button') as HTMLButtonElement
  return { props, button }
}

describe('ClusterAIActions', () => {
  it('disables repair and shows no badge when there are no issues', () => {
    const { button } = setup()
    const repair = button('clusterDetail.repair')
    expect(repair).toBeDisabled()
    expect(repair).toHaveAttribute('title', 'clusterDetail.noIssuesToRepair')
    expect(button('clusterDetail.diagnose')).toBeEnabled()
    expect(button('clusterDetail.ask')).toBeEnabled()
  })

  it('sums pod and deployment issues into the repair badge and enables repair', async () => {
    const user = userEvent.setup()
    const { props, button } = setup({ podIssuesCount: 2, deploymentIssuesCount: 3 })
    const repair = button('clusterDetail.repair')
    expect(repair).toBeEnabled()
    expect(repair).toHaveAttribute('title', 'clusterDetail.repairTitle')
    expect(repair).toHaveTextContent('5')
    await user.click(repair)
    expect(props.onRepair).toHaveBeenCalledTimes(1)
  })

  it('invokes diagnose and ask callbacks', async () => {
    const user = userEvent.setup()
    const { props, button } = setup()
    await user.click(button('clusterDetail.diagnose'))
    await user.click(button('clusterDetail.ask'))
    expect(props.onDiagnose).toHaveBeenCalledTimes(1)
    expect(props.onAsk).toHaveBeenCalledTimes(1)
  })

  it('disables every action when the cluster is unreachable', () => {
    const { button } = setup({ isUnreachable: true, podIssuesCount: 4 })
    expect(button('clusterDetail.diagnose')).toBeDisabled()
    expect(button('clusterDetail.repair')).toBeDisabled()
    expect(button('clusterDetail.ask')).toBeDisabled()
  })
})
