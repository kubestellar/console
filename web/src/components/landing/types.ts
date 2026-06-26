import type { ReactNode } from 'react'

import type { InstallCopySource } from '../../lib/analytics-types'
import type { ComparisonRow } from './ComparisonTable'
import type { HighlightFeature } from './HighlightGrid'
import type { InstallStep } from './InstallStepCard'
import type { AccentColor } from './styles'
import type { DeployTab } from './TabbedDeploySection'

export interface CompetitorLandingPageProps {
  accentColor: AccentColor
  competitorName: string
  competitorSubtitle?: string
  analyticsSource: InstallCopySource
  heroBadgeIcon: ReactNode
  heroBadgeText: string
  heroLeadText: string
  heroLeadEmphasis: string
  heroSupportText: string
  appreciationIcon: ReactNode
  appreciationTitle: string
  appreciationDescription: string
  appreciationLinkHref: string
  appreciationLinkLabel: string
  highlightTitle: string
  highlightTitleAccent: string
  highlightSubtitle: string
  highlights: HighlightFeature[]
  comparisonTitle: string
  comparisonSubtitle: string
  comparisonRows: ComparisonRow[]
  deployTitle: string
  deploySubtitle: string
  localhostSteps: InstallStep[]
  portForwardSteps: InstallStep[]
  ingressSteps: InstallStep[]
  footerDescription: string
  onViewed: () => void
  onActioned: (action: string) => void
  onTabSwitch: (tab: DeployTab) => void
  onCommandCopy: (tab: DeployTab, step: number, command: string) => void
}
