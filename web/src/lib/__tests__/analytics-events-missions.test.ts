import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../analytics-core', () => ({
  send: vi.fn(),
  setAnalyticsUserProperties: vi.fn(),
  emitError: vi.fn(),
}))

vi.mock('../demoMode', () => ({
  isDemoMode: vi.fn(() => false),
}))

vi.mock('../analytics-session', () => ({
  getDeploymentType: vi.fn(() => 'localhost'),
}))

import { send, setAnalyticsUserProperties, emitError } from '../analytics-core'
import { isDemoMode } from '../demoMode'
import { getDeploymentType } from '../analytics-session'
import { CAPABILITY_TOOL_EXEC, CAPABILITY_CHAT } from '../analytics-types'
import * as analytics from '../analytics-events'

const mockSend = vi.mocked(send)
const mockSetProps = vi.mocked(setAnalyticsUserProperties)
const mockEmitError = vi.mocked(emitError)
const mockIsDemoMode = vi.mocked(isDemoMode)
const mockGetDeploymentType = vi.mocked(getDeploymentType)

describe('analytics-events/missions', () => {
  beforeEach(() => {
    mockSend.mockClear()
    mockSetProps.mockClear()
    mockEmitError.mockClear()
    mockIsDemoMode.mockClear()
    mockGetDeploymentType.mockClear()
    mockIsDemoMode.mockReturnValue(false)
    mockGetDeploymentType.mockReturnValue('localhost')
    localStorage.clear()
    sessionStorage.clear()
  })

  describe('Missions', () => {
    it('analytics.emitMissionStarted sends mission type and provider', () => {
      analytics.emitMissionStarted('install', 'claude')
      expect(mockSend).toHaveBeenCalledWith('ksc_mission_started', {
        mission_type: 'install',
        agent_provider: 'claude',
      })
    })

    it('analytics.emitMissionCompleted sends mission type and duration', () => {
      analytics.emitMissionCompleted('install', 120)
      expect(mockSend).toHaveBeenCalledWith('ksc_mission_completed', {
        mission_type: 'install',
        duration_sec: 120,
      })
    })

    it('analytics.emitMissionError sends mission type, error code, and trimmed detail', () => {
      analytics.emitMissionError('install', 'timeout', 'connection timed out after 30s')
      expect(mockSend).toHaveBeenCalledWith('ksc_mission_error', {
        mission_type: 'install',
        error_code: 'timeout',
        error_detail: 'connection timed out after 30s',
      })
    })

    it('analytics.emitMissionError truncates error detail to 100 characters', () => {
      const longDetail = 'x'.repeat(150)
      analytics.emitMissionError('install', 'timeout', longDetail)
      expect(mockSend).toHaveBeenCalledWith('ksc_mission_error', {
        mission_type: 'install',
        error_code: 'timeout',
        error_detail: 'x'.repeat(100),
      })
    })

    it('analytics.emitMissionError sends empty string when detail is undefined', () => {
      analytics.emitMissionError('install', 'timeout')
      expect(mockSend).toHaveBeenCalledWith('ksc_mission_error', {
        mission_type: 'install',
        error_code: 'timeout',
        error_detail: '',
      })
    })

    it('analytics.emitMissionError trims whitespace from detail', () => {
      analytics.emitMissionError('install', 'timeout', '  some error  ')
      expect(mockSend).toHaveBeenCalledWith('ksc_mission_error', {
        mission_type: 'install',
        error_code: 'timeout',
        error_detail: 'some error',
      })
    })

    it('analytics.emitMissionRated sends with bypassOptOut', () => {
      analytics.emitMissionRated('install', 'positive')
      expect(mockSend).toHaveBeenCalledWith(
        'ksc_mission_rated',
        { mission_type: 'install', rating: 'positive' },
        { bypassOptOut: true },
      )
    })
  })

  describe('Mission Browser / Knowledge Base', () => {
    it('analytics.emitFixerSearchStarted sends cluster_connected', () => {
      analytics.emitFixerSearchStarted(true)
      expect(mockSend).toHaveBeenCalledWith('ksc_fixer_search', { cluster_connected: true })
    })

    it('analytics.emitFixerSearchCompleted sends found and scanned counts', () => {
      analytics.emitFixerSearchCompleted(5, 20)
      expect(mockSend).toHaveBeenCalledWith('ksc_fixer_search_done', { found: 5, scanned: 20 })
    })

    it('analytics.emitFixerBrowsed sends path', () => {
      analytics.emitFixerBrowsed('/missions/install-istio')
      expect(mockSend).toHaveBeenCalledWith('ksc_fixer_browsed', { path: '/missions/install-istio' })
    })

    it('analytics.emitFixerViewed sends title and cncfProject', () => {
      analytics.emitFixerViewed('Install Istio', 'istio')
      expect(mockSend).toHaveBeenCalledWith('ksc_fixer_viewed', { title: 'Install Istio', cncf_project: 'istio' })
    })

    it('analytics.emitFixerViewed defaults cncfProject to empty string', () => {
      analytics.emitFixerViewed('Custom Mission')
      expect(mockSend).toHaveBeenCalledWith('ksc_fixer_viewed', { title: 'Custom Mission', cncf_project: '' })
    })

    it('analytics.emitFixerImported sends title and cncfProject', () => {
      analytics.emitFixerImported('Install Falco', 'falco')
      expect(mockSend).toHaveBeenCalledWith('ksc_fixer_imported', { title: 'Install Falco', cncf_project: 'falco' })
    })

    it('analytics.emitFixerImported defaults cncfProject to empty string', () => {
      analytics.emitFixerImported('Custom')
      expect(mockSend).toHaveBeenCalledWith('ksc_fixer_imported', { title: 'Custom', cncf_project: '' })
    })

    it('analytics.emitFixerImportError sends title, error count, and truncated first error', () => {
      analytics.emitFixerImportError('Mission', 3, 'a'.repeat(150))
      expect(mockSend).toHaveBeenCalledWith('ksc_fixer_import_error', {
        title: 'Mission',
        error_count: '3',
        first_error: 'a'.repeat(100),
      })
    })

    it('analytics.emitFixerLinkCopied sends title and cncfProject', () => {
      analytics.emitFixerLinkCopied('Install Cert Manager', 'cert-manager')
      expect(mockSend).toHaveBeenCalledWith('ksc_fixer_link_copied', { title: 'Install Cert Manager', cncf_project: 'cert-manager' })
    })

    it('analytics.emitFixerLinkCopied defaults cncfProject to empty string', () => {
      analytics.emitFixerLinkCopied('Custom')
      expect(mockSend).toHaveBeenCalledWith('ksc_fixer_link_copied', { title: 'Custom', cncf_project: '' })
    })

    it('analytics.emitFixerGitHubLink sends event with no params', () => {
      analytics.emitFixerGitHubLink()
      expect(mockSend).toHaveBeenCalledWith('ksc_fixer_github_link')
    })
  })

  describe('Orbit', () => {
    it('analytics.emitOrbitMissionCreated sends orbit type and cadence', () => {
      analytics.emitOrbitMissionCreated('cert-renewal', 'weekly')
      expect(mockSend).toHaveBeenCalledWith('ksc_orbit_mission_created', { orbit_type: 'cert-renewal', cadence: 'weekly' })
    })

    it('analytics.emitOrbitMissionRun sends orbit type and result', () => {
      analytics.emitOrbitMissionRun('cert-renewal', 'success')
      expect(mockSend).toHaveBeenCalledWith('ksc_orbit_mission_run', { orbit_type: 'cert-renewal', result: 'success' })
    })

    it('analytics.emitGroundControlDashboardCreated sends card count', () => {
      analytics.emitGroundControlDashboardCreated(5)
      expect(mockSend).toHaveBeenCalledWith('ksc_ground_control_dashboard_created', { card_count: 5 })
    })

    it('analytics.emitGroundControlCardRequestOpened sends project', () => {
      analytics.emitGroundControlCardRequestOpened('istio')
      expect(mockSend).toHaveBeenCalledWith('ksc_ground_control_card_request', { project: 'istio' })
    })
  })

  describe('Deploy', () => {
    it('analytics.emitDeployWorkload sends workload name and cluster group', () => {
      analytics.emitDeployWorkload('nginx', 'production')
      expect(mockSend).toHaveBeenCalledWith('ksc_deploy_workload', { workload_name: 'nginx', cluster_group: 'production' })
    })

    it('analytics.emitDeployTemplateApplied sends template name', () => {
      analytics.emitDeployTemplateApplied('standard-web')
      expect(mockSend).toHaveBeenCalledWith('ksc_deploy_template_applied', { template_name: 'standard-web' })
    })
  })

  describe('Compliance', () => {
    it('analytics.emitComplianceDrillDown sends stat type', () => {
      analytics.emitComplianceDrillDown('violations')
      expect(mockSend).toHaveBeenCalledWith('ksc_compliance_drill_down', { stat_type: 'violations' })
    })

    it('analytics.emitComplianceFilterChanged sends filter type', () => {
      analytics.emitComplianceFilterChanged('severity')
      expect(mockSend).toHaveBeenCalledWith('ksc_compliance_filter_changed', { filter_type: 'severity' })
    })
  })

  describe('Benchmarks', () => {
    it('analytics.emitBenchmarkViewed sends benchmark type', () => {
      analytics.emitBenchmarkViewed('latency')
      expect(mockSend).toHaveBeenCalledWith('ksc_benchmark_viewed', { benchmark_type: 'latency' })
    })
  })

  describe('Mission Suggestions', () => {
    it('analytics.emitMissionSuggestionsShown sends suggestion and critical counts', () => {
      analytics.emitMissionSuggestionsShown(5, 2)
      expect(mockSend).toHaveBeenCalledWith('ksc_mission_suggestions_shown', { suggestion_count: 5, critical_count: 2 })
    })

    it('analytics.emitMissionSuggestionActioned sends mission type, priority, and action', () => {
      analytics.emitMissionSuggestionActioned('security-scan', 'critical', 'start')
      expect(mockSend).toHaveBeenCalledWith('ksc_mission_suggestion_actioned', {
        mission_type: 'security-scan',
        priority: 'critical',
        action: 'start',
      })
    })
  })

  describe('ACMM Dashboard', () => {
    it('analytics.emitACMMScanned sends repo, level, detected, and total', () => {
      analytics.emitACMMScanned('kubestellar/console', 3, 15, 20)
      expect(mockSend).toHaveBeenCalledWith('ksc_acmm_scanned', {
        repo: 'kubestellar/console',
        acmm_level: 3,
        detected: 15,
        total: 20,
      })
    })

    it('analytics.emitACMMMissionLaunched sends repo, criterion details, and target level', () => {
      analytics.emitACMMMissionLaunched('kubestellar/console', 'crit-123', 'acmm', 4)
      expect(mockSend).toHaveBeenCalledWith('ksc_acmm_mission_launched', {
        repo: 'kubestellar/console',
        criterion_id: 'crit-123',
        criterion_source: 'acmm',
        target_level: 4,
      })
    })

    it('analytics.emitACMMLevelMissionLaunched sends repo, target level, and criteria count', () => {
      analytics.emitACMMLevelMissionLaunched('kubestellar/console', 2, 5)
      expect(mockSend).toHaveBeenCalledWith('ksc_acmm_level_mission_launched', {
        repo: 'kubestellar/console',
        target_level: 2,
        criteria_count: 5,
      })
    })
  })
describe('analytics.emitMissionToolMissing', () => {
  it('sends ksc_mission_tool_missing with type and tool when no detail', () => {
    analytics.emitMissionToolMissing('deploy', 'kubectl')
    expect(mockSend).toHaveBeenCalledWith('ksc_mission_tool_missing', {
      mission_type: 'deploy',
      missing_tool: 'kubectl',
      error_detail: '',
    })
  })

  it('includes error_detail when provided', () => {
    analytics.emitMissionToolMissing('scan', 'trivy', 'trivy binary not found in PATH')
    expect(mockSend).toHaveBeenCalledWith('ksc_mission_tool_missing', {
      mission_type: 'scan',
      missing_tool: 'trivy',
      error_detail: 'trivy binary not found in PATH',
    })
  })

  it('truncates error_detail to 100 chars', () => {
    const longDetail = 'x'.repeat(150)
    analytics.emitMissionToolMissing('install', 'helm', longDetail)
    expect(mockSend).toHaveBeenCalledWith('ksc_mission_tool_missing', {
      mission_type: 'install',
      missing_tool: 'helm',
      error_detail: 'x'.repeat(100),
    })
  })

  it('trims whitespace from error_detail before truncating', () => {
    const paddedDetail = '  missing binary  '
    analytics.emitMissionToolMissing('upgrade', 'flux', paddedDetail)
    expect(mockSend).toHaveBeenCalledWith('ksc_mission_tool_missing', {
      mission_type: 'upgrade',
      missing_tool: 'flux',
      error_detail: 'missing binary',
    })
  })

  it('sends empty error_detail for whitespace-only string', () => {
    analytics.emitMissionToolMissing('deploy', 'kustomize', '   ')
    expect(mockSend).toHaveBeenCalledWith('ksc_mission_tool_missing', {
      mission_type: 'deploy',
      missing_tool: 'kustomize',
      error_detail: '',
    })
  })

  it('preserves exactly 100 chars when detail is exactly 100 chars long', () => {
    const exactDetail = 'a'.repeat(100)
    analytics.emitMissionToolMissing('check', 'kubeconform', exactDetail)
    expect(mockSend).toHaveBeenCalledWith('ksc_mission_tool_missing', {
      mission_type: 'check',
      missing_tool: 'kubeconform',
      error_detail: exactDetail,
    })
  })

  it('calls send exactly once per invocation', () => {
    analytics.emitMissionToolMissing('lint', 'golangci-lint')
    expect(mockSend).toHaveBeenCalledTimes(1)
  })
})
})
