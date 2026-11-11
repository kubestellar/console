import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BuildpackAiPanel } from './BuildpackAiPanel'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../../ui/ConsoleAIIcon', () => ({
  ConsoleAIIcon: () => <span>AI icon</span>,
}))

describe('BuildpackAiPanel', () => {
  it('shows the not-connected state and disables analyze', () => {
    render(<BuildpackAiPanel isAgentConnected={false} onDiagnose={vi.fn()} />)
    expect(screen.getByText('AI agent not connected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Analyze Buildpack/ })).toBeDisabled()
    expect(screen.queryByText('drilldown.buildpack.availableAIActions')).not.toBeInTheDocument()
  })

  it('lists available AI actions when connected', () => {
    render(<BuildpackAiPanel isAgentConnected onDiagnose={vi.fn()} />)
    expect(screen.getByText('drilldown.buildpack.availableAIActions')).toBeInTheDocument()
    expect(screen.getByText('drilldown.buildpack.buildHealthAnalysis')).toBeInTheDocument()
    expect(screen.getByText('drilldown.buildpack.optimizationRecommendations')).toBeInTheDocument()
    expect(screen.queryByText('AI agent not connected')).not.toBeInTheDocument()
  })

  it('calls onDiagnose when analyze is clicked', async () => {
    const onDiagnose = vi.fn()
    render(<BuildpackAiPanel isAgentConnected onDiagnose={onDiagnose} />)
    await userEvent.click(screen.getByRole('button', { name: /Analyze Buildpack/ }))
    expect(onDiagnose).toHaveBeenCalledTimes(1)
  })
})
