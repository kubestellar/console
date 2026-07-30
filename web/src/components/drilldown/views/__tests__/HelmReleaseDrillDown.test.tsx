import React from 'react'
/**
 * RTL interaction tests for HelmReleaseDrillDown (#15406, Part of #4189).
 */
import './drilldown-interaction-mocks'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import {
  mockDrillToDeployment,
  mockRunHelm,
  renderWithDrillDown,
} from './drilldown-interaction-helpers'

const mockRollbackFn = vi.hoisted(() => vi.fn())

vi.mock('../../../../hooks/useDrillDown', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../hooks/useDrillDown')>()
  return {
    ...actual,
    useDrillDownActions: () => ({
      drillToNamespace: vi.fn(),
      drillToCluster: vi.fn(),
      drillToDeployment: mockDrillToDeployment,
      drillToService: vi.fn(),
    }),
    useDrillDown: () => ({ close: vi.fn() }),
  }
})

vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: vi.fn() }),
}))

vi.mock('../../../../hooks/useHelmActions', () => ({
  useHelmActions: () => ({
    rollback: mockRollbackFn,
    uninstall: vi.fn(),
    isLoading: false,
  }),
}))

vi.mock('../../../modals', () => ({
  AIActionBar: () => null,
  useModalAI: () => ({
    defaultAIActions: [],
    handleAIAction: vi.fn(),
    isAgentConnected: false,
  }),
}))

import { HelmReleaseDrillDown } from '../HelmReleaseDrillDown'

const BASE_DATA = {
  cluster: 'cluster-a',
  namespace: 'default',
  release: 'nginx',
  chart: 'nginx',
  chartVersion: '1.2.0',
  appVersion: '1.25',
  status: 'deployed',
  revision: '2',
}

const HELM_STATUS_JSON = {
  name: 'nginx',
  namespace: 'default',
  version: 2,
  info: { status: 'deployed', last_deployed: '2026-05-02T12:00:00Z' },
  chart: { metadata: { name: 'nginx', appVersion: '1.25' } },
}

const HELM_HISTORY_JSON = [
  {
    revision: 2,
    updated: '2026-05-02T12:00:00Z',
    status: 'deployed',
    chart: 'nginx-1.2.0',
    app_version: '1.25',
    description: 'Upgrade complete',
  },
  {
    revision: 1,
    updated: '2026-05-01T12:00:00Z',
    status: 'superseded',
    chart: 'nginx-1.1.0',
    app_version: '1.24',
    description: 'Install complete',
  },
]

const HELM_MANIFEST = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: default
---
apiVersion: v1
kind: Service
metadata:
  name: web-svc
  namespace: default
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: web-config
  namespace: default`

function setupHelmMocks(options?: { valuesError?: boolean }) {
  mockRunHelm.mockImplementation(async (args: string[]) => {
    const joined = args.join(' ')
    if (joined.includes('status')) {
      return JSON.stringify(HELM_STATUS_JSON)
    }
    if (joined.includes('history')) {
      return JSON.stringify(HELM_HISTORY_JSON)
    }
    if (joined.includes('get') && joined.includes('values')) {
      if (options?.valuesError) {
        throw new Error('helm unavailable')
      }
      return 'replicaCount: 2'
    }
    if (joined.includes('manifest')) {
      return HELM_MANIFEST
    }
    return ''
  })
}

describe('HelmReleaseDrillDown interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupHelmMocks()
  })

  it('renders revision history when the history tab is selected', async () => {
    renderWithDrillDown(<HelmReleaseDrillDown data={BASE_DATA} />)

    await waitFor(() => {
      expect(screen.getByText('nginx')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'drilldown.tabs.history' }))

    await waitFor(() => {
      expect(screen.getByText('Upgrade complete')).toBeInTheDocument()
      expect(screen.getByText('Install complete')).toBeInTheDocument()
    })
    expect(screen.getByText('nginx-1.2.0')).toBeInTheDocument()
    expect(screen.getByText('nginx-1.1.0')).toBeInTheDocument()
  })

  it('shows an inline error message when release values cannot be loaded', async () => {
    setupHelmMocks({ valuesError: true })
    renderWithDrillDown(<HelmReleaseDrillDown data={BASE_DATA} />)

    await waitFor(() => {
      expect(screen.getByText('nginx')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'drilldown.tabs.values' }))

    await waitFor(() => {
      expect(screen.getByText('Error fetching values')).toBeInTheDocument()
    })
  })

  it('loads the full manifest resource list when the resources tab is opened', async () => {
    const manyResourceManifest = [
      ...Array.from({ length: 12 }, (_, index) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-${index}
  namespace: default`),
      `apiVersion: v1
kind: Service
metadata:
  name: web-svc
  namespace: default`,
    ].join('\n---\n')

    mockRunHelm.mockImplementation(async (args: string[]) => {
      const joined = args.join(' ')
      if (joined.includes('status')) return JSON.stringify(HELM_STATUS_JSON)
      if (joined.includes('history')) return JSON.stringify(HELM_HISTORY_JSON)
      if (joined.includes('get') && joined.includes('values')) return 'replicaCount: 1'
      if (joined.includes('manifest')) return manyResourceManifest
      return ''
    })

    renderWithDrillDown(<HelmReleaseDrillDown data={BASE_DATA} />)

    await waitFor(() => {
      expect(screen.getByText('nginx')).toBeInTheDocument()
    })
    expect(screen.queryByText('web-11')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'drilldown.tabs.resources' }))

    await waitFor(() => {
      expect(screen.getByText('web-0')).toBeInTheDocument()
      expect(screen.getByText('web-11')).toBeInTheDocument()
      expect(screen.getByText('web-svc')).toBeInTheDocument()
    })
  })

  it('drills to a deployment when a manifest resource row is clicked', async () => {
    renderWithDrillDown(<HelmReleaseDrillDown data={BASE_DATA} />)

    fireEvent.click(screen.getByRole('button', { name: 'drilldown.tabs.resources' }))

    const resourcesPanel = await waitFor(() => {
      const heading = screen.getByText('drilldown.helm.manifestResources')
      expect(heading).toBeInTheDocument()
      return heading.closest('div')!.parentElement!
    })

    fireEvent.click(within(resourcesPanel).getByText('web'))

    expect(mockDrillToDeployment).toHaveBeenCalledWith('cluster-a', 'default', 'web')
  })

  it('shows the correct revision and rollback buttons after a successful rollback', async () => {
    // Helm creates a new revision (3) when rolling back from rev 2 to rev 1.
    // Before fix, the stale `releaseRevision` prop ("2") shadowed the freshly-fetched
    // `releaseInfo.revision` ("3"), so rev 3 incorrectly showed a Rollback button
    // and the Overview still displayed "Revision: 2".
    const POST_ROLLBACK_HISTORY = [
      { revision: 3, updated: '2026-05-03T10:00:00Z', status: 'deployed',   chart: 'nginx-1.1.0', app_version: '1.24', description: 'Rollback to 1' },
      { revision: 2, updated: '2026-05-02T12:00:00Z', status: 'superseded', chart: 'nginx-1.2.0', app_version: '1.25', description: 'Upgrade complete' },
      { revision: 1, updated: '2026-05-01T12:00:00Z', status: 'superseded', chart: 'nginx-1.1.0', app_version: '1.24', description: 'Install complete' },
    ]

    let postRollback = false
    mockRollbackFn.mockImplementation(async () => {
      postRollback = true
      return { success: true, message: 'Rolled back successfully' }
    })
    mockRunHelm.mockImplementation(async (args: string[]) => {
      const joined = args.join(' ')
      if (joined.includes('status')) {
        return JSON.stringify(postRollback ? { ...HELM_STATUS_JSON, version: 3 } : HELM_STATUS_JSON)
      }
      if (joined.includes('history')) {
        return JSON.stringify(postRollback ? POST_ROLLBACK_HISTORY : HELM_HISTORY_JSON)
      }
      if (joined.includes('get') && joined.includes('values')) return 'replicaCount: 2'
      if (joined.includes('manifest')) return HELM_MANIFEST
      return ''
    })

    renderWithDrillDown(<HelmReleaseDrillDown data={BASE_DATA} />)
    await waitFor(() => expect(screen.getByText('nginx')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'drilldown.tabs.history' }))
    await waitFor(() => expect(screen.getByText('Upgrade complete')).toBeInTheDocument())

    // Pre-rollback: rev 1 (superseded) has a Rollback button; rev 2 (current) does not
    expect(screen.getByTitle('Roll back to revision 1')).toBeInTheDocument()
    expect(screen.queryByTitle('Roll back to revision 2')).not.toBeInTheDocument()

    // Trigger rollback to rev 1
    fireEvent.click(screen.getByTitle('Roll back to revision 1'))
    await waitFor(() => expect(screen.getByText(/Roll back "nginx" to revision 1/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Rollback to #1' }))

    // Success feedback
    await waitFor(() => expect(screen.getByText('Rolled back successfully')).toBeInTheDocument())

    // Post-rollback: history refreshes — rev 3 is now current (no Rollback button)
    await waitFor(() => expect(screen.getByText('Rollback to 1')).toBeInTheDocument())
    expect(screen.queryByTitle('Roll back to revision 3')).not.toBeInTheDocument()
    // Rev 2 (now superseded) gets its Rollback button back
    expect(screen.getByTitle('Roll back to revision 2')).toBeInTheDocument()

    // Overview must show the updated revision number from the live fetch, not the stale prop
    fireEvent.click(screen.getByRole('button', { name: 'drilldown.tabs.overview' }))
    await waitFor(() => expect(screen.getByText('Revision: 3')).toBeInTheDocument())
  })
})
