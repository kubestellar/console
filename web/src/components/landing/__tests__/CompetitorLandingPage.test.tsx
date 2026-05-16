import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../../lib/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}))

vi.mock('../../../lib/analytics', () => ({
  emitInstallCommandCopied: vi.fn(),
}))

import { CompetitorLandingPage } from '../CompetitorLandingPage'
import type { CompetitorLandingPageProps } from '../types'

const BASE_PROPS: CompetitorLandingPageProps = {
  accentColor: 'teal',
  competitorName: 'Headlamp',
  competitorSubtitle: '(CNCF Sandbox)',
  analyticsSource: 'from_headlamp',
  heroBadgeIcon: <span>badge-icon</span>,
  heroBadgeText: 'Fellow CNCF Projects',
  heroLeadText: 'Headlamp is a great Kubernetes dashboard.',
  heroLeadEmphasis: 'KubeStellar Console adds multi-cluster AI.',
  heroSupportText: 'Both are open source.',
  appreciationIcon: <span>praise-icon</span>,
  appreciationTitle: 'Headlamp does a lot of things right',
  appreciationDescription: 'Plugin architecture and clean UI.',
  appreciationLinkHref: 'https://headlamp.dev',
  appreciationLinkLabel: 'Visit headlamp.dev',
  highlightTitle: 'What Console',
  highlightTitleAccent: 'adds to your toolkit',
  highlightSubtitle: 'Built-in capabilities.',
  highlights: [
    {
      icon: <span>icon</span>,
      title: 'AI Missions',
      description: 'Natural-language troubleshooting.',
    },
  ],
  comparisonTitle: 'Feature comparison',
  comparisonSubtitle: 'An honest look.',
  comparisonRows: [
    {
      feature: 'Open Source',
      competitor: true,
      console: true,
    },
  ],
  deployTitle: 'Try it in',
  deploySubtitle: 'Runs alongside existing tools.',
  localhostSteps: [
    {
      step: 1,
      title: 'Install and run',
      commands: ['curl -sSL https://example.com/start.sh | bash'],
      description: 'Starts the console.',
    },
  ],
  portForwardSteps: [
    {
      step: 1,
      title: 'Install',
      commands: ['helm install kc chart'],
      description: 'Deploy to cluster.',
    },
  ],
  ingressSteps: [
    {
      step: 1,
      title: 'Install with ingress',
      commands: ['helm install kc chart --set ingress.enabled=true'],
      description: 'Expose with ingress.',
    },
  ],
  footerDescription: 'Try Console alongside Headlamp.',
  onViewed: vi.fn(),
  onActioned: vi.fn(),
  onTabSwitch: vi.fn(),
  onCommandCopy: vi.fn(),
}

function renderPage(props: Partial<CompetitorLandingPageProps> = {}) {
  return render(
    <MemoryRouter>
      <CompetitorLandingPage {...BASE_PROPS} {...props} />
    </MemoryRouter>,
  )
}

describe('CompetitorLandingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls onViewed when rendered', () => {
    renderPage()
    expect(BASE_PROPS.onViewed).toHaveBeenCalledTimes(1)
  })

  it('wires hero and footer CTA actions', () => {
    renderPage()

    fireEvent.click(screen.getByText('Try Demo Mode'))
    fireEvent.click(screen.getByText('Try Demo'))
    const githubLinks = screen.getAllByText('View on GitHub')
    fireEvent.click(githubLinks[0])
    fireEvent.click(githubLinks[1])

    expect(BASE_PROPS.onActioned).toHaveBeenCalledWith('hero_try_demo')
    expect(BASE_PROPS.onActioned).toHaveBeenCalledWith('footer_try_demo')
    expect(BASE_PROPS.onActioned).toHaveBeenCalledWith('hero_view_github')
    expect(BASE_PROPS.onActioned).toHaveBeenCalledWith('footer_view_github')
  })

  it('wires deploy tab switch and command copy callbacks', async () => {
    renderPage()

    const clusterButtons = screen.getAllByText('Cluster')
    fireEvent.click(clusterButtons[0])
    expect(BASE_PROPS.onTabSwitch).toHaveBeenCalledWith('cluster-portforward')

    const copyButtons = screen.getAllByTitle('Copy commands')
    fireEvent.click(copyButtons[0])
    await Promise.resolve()

    expect(BASE_PROPS.onCommandCopy).toHaveBeenCalled()
  })
})
