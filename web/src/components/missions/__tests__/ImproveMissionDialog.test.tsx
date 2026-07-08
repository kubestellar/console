import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'missions.improve.title': 'Improve this AI Mission',
        'missions.improve.quality': 'Quality: {{score}}/100',
        'missions.improve.sectionLabel': 'Which section needs improvement?',
        'missions.improve.sections.general': 'General',
        'missions.improve.sections.install': 'Install',
        'missions.improve.sections.uninstall': 'Uninstall',
        'missions.improve.sections.upgrade': 'Upgrade',
        'missions.improve.sections.troubleshooting': 'Troubleshooting',
        'missions.improve.categoryLabel': 'What kind of improvement?',
        'missions.improve.categories.wrongCommand.label': 'Wrong command',
        'missions.improve.categories.wrongCommand.description': 'A command is incorrect or does not work',
        'missions.improve.categories.missingStep.label': 'Missing step',
        'missions.improve.categories.missingStep.description': 'An important step is missing from the guide',
        'missions.improve.categories.betterApproach.label': 'Better approach',
        'missions.improve.categories.betterApproach.description': 'There is a better way to do this',
        'missions.improve.categories.outdatedVersion.label': 'Outdated version',
        'missions.improve.categories.outdatedVersion.description': 'The version or image tag is outdated',
        'missions.improve.categories.securityConcern.label': 'Security concern',
        'missions.improve.categories.securityConcern.description': 'There is a security issue with the steps',
        'missions.improve.categories.other.label': 'Other',
        'missions.improve.categories.other.description': 'Something else needs improvement',
        'missions.improve.detailsLabel': 'Details (optional)',
        'missions.improve.detailsPlaceholder': 'Describe the improvement needed. Include the correct command, better approach, or updated version...',
        'missions.improve.footer': 'Opens a GitHub issue in kubestellar/console-kb',
        'missions.improve.cancel': 'Cancel',
        'missions.improve.openIssue': 'Open Issue',
      }
      let value = map[key] ?? key
      for (const [name, replacement] of Object.entries(options ?? {})) {
        value = value.replace(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'g'), String(replacement))
      }
      return value
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useDemoMode')>()),
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/analytics')>()),
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}
))

vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('../../../lib/cn', () => ({
  cn: vi.fn(),
}))

import { ImproveMissionDialog } from '../ImproveMissionDialog'

describe('ImproveMissionDialog', () => {
  it('renders without crashing', () => {
    const { container } = render(<ImproveMissionDialog isOpen={false} onClose={() => {}} mission={{} as Record<string, unknown>} />)
    expect(container).toBeTruthy()
  })
})
