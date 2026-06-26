/**
 * Coverage for analytics-events/missions.ts
 *
 * Every exported function is a thin `send()` wrapper.  Tests verify:
 *   - the correct GA4 event name is emitted
 *   - the payload shape matches the documented dimensions
 *   - edge cases: empty/long error_detail truncation, undefined optional args
 *
 * analytics-core is fully mocked so no network activity occurs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../analytics-core', () => ({
  send: vi.fn(),
}))

import { send } from '../../analytics-core'

import {
  emitMissionStarted,
  emitMissionCompleted,
  emitMissionError,
  emitMissionToolMissing,
  emitMissionRated,
  emitFixerSearchStarted,
  emitFixerSearchCompleted,
  emitFixerBrowsed,
  emitFixerViewed,
  emitFixerImported,
  emitFixerImportError,
  emitFixerLinkCopied,
  emitFixerGitHubLink,
  emitOrbitMissionCreated,
  emitOrbitMissionRun,
  emitGroundControlDashboardCreated,
  emitGroundControlCardRequestOpened,
  emitDeployWorkload,
  emitDeployTemplateApplied,
  emitComplianceDrillDown,
  emitComplianceFilterChanged,
  emitBenchmarkViewed,
  emitMissionSuggestionsShown,
  emitMissionSuggestionActioned,
  emitACMMScanned,
  emitACMMMissionLaunched,
  emitACMMLevelMissionLaunched,
} from '../missions'

const mockSend = send as ReturnType<typeof vi.fn>

beforeEach(() => {
  mockSend.mockClear()
})

// ── AI Missions ────────────────────────────────────────────────────

describe('emitMissionStarted', () => {
  it('sends ksc_mission_started with mission_type and agent_provider', () => {
    emitMissionStarted('diagnose', 'claude')
    expect(mockSend).toHaveBeenCalledOnce()
    expect(mockSend).toHaveBeenCalledWith('ksc_mission_started', {
      mission_type: 'diagnose',
      agent_provider: 'claude',
    })
  })
})

describe('emitMissionCompleted', () => {
  it('sends ksc_mission_completed with mission_type and duration_sec', () => {
    emitMissionCompleted('insights', 42.5)
    expect(mockSend).toHaveBeenCalledWith('ksc_mission_completed', {
      mission_type: 'insights',
      duration_sec: 42.5,
    })
  })
})

describe('emitMissionError', () => {
  it('sends ksc_mission_error with trimmed error_detail', () => {
    emitMissionError('diagnose', 'timeout', '  connection refused  ')
    expect(mockSend).toHaveBeenCalledWith('ksc_mission_error', {
      mission_type: 'diagnose',
      error_code: 'timeout',
      error_detail: 'connection refused',
    })
  })

  it('truncates error_detail to 100 characters', () => {
    const long = 'x'.repeat(200)
    emitMissionError('diagnose', 'err', long)
    const call = mockSend.mock.calls[0]
    expect(call[1].error_detail).toHaveLength(100)
  })

  it('uses empty string when errorDetail is undefined', () => {
    emitMissionError('diagnose', 'err')
    expect(mockSend).toHaveBeenCalledWith('ksc_mission_error', {
      mission_type: 'diagnose',
      error_code: 'err',
      error_detail: '',
    })
  })

  it('uses empty string when errorDetail is whitespace-only', () => {
    emitMissionError('diagnose', 'err', '   ')
    expect(mockSend).toHaveBeenCalledWith('ksc_mission_error', {
      mission_type: 'diagnose',
      error_code: 'err',
      error_detail: '',
    })
  })
})

describe('emitMissionToolMissing', () => {
  it('sends ksc_mission_tool_missing with correct payload', () => {
    emitMissionToolMissing('diagnose', 'kubectl', 'binary not found')
    expect(mockSend).toHaveBeenCalledWith('ksc_mission_tool_missing', {
      mission_type: 'diagnose',
      missing_tool: 'kubectl',
      error_detail: 'binary not found',
    })
  })

  it('truncates error_detail to 100 chars', () => {
    emitMissionToolMissing('x', 'tool', 'e'.repeat(150))
    expect(mockSend.mock.calls[0][1].error_detail).toHaveLength(100)
  })

  it('uses empty string when errorDetail is omitted', () => {
    emitMissionToolMissing('x', 'tool')
    expect(mockSend.mock.calls[0][1].error_detail).toBe('')
  })
})

describe('emitMissionRated', () => {
  it('sends ksc_mission_rated with bypassOptOut: true', () => {
    emitMissionRated('diagnose', 'thumbs_up')
    expect(mockSend).toHaveBeenCalledWith(
      'ksc_mission_rated',
      { mission_type: 'diagnose', rating: 'thumbs_up' },
      { bypassOptOut: true },
    )
  })
})

// ── Fixer / KB ─────────────────────────────────────────────────────

describe('emitFixerSearchStarted', () => {
  it('sends ksc_fixer_search with cluster_connected flag', () => {
    emitFixerSearchStarted(true)
    expect(mockSend).toHaveBeenCalledWith('ksc_fixer_search', { cluster_connected: true })
  })
})

describe('emitFixerSearchCompleted', () => {
  it('sends ksc_fixer_search_done with found and scanned counts', () => {
    emitFixerSearchCompleted(3, 50)
    expect(mockSend).toHaveBeenCalledWith('ksc_fixer_search_done', { found: 3, scanned: 50 })
  })
})

describe('emitFixerBrowsed', () => {
  it('sends ksc_fixer_browsed with path', () => {
    emitFixerBrowsed('/networking')
    expect(mockSend).toHaveBeenCalledWith('ksc_fixer_browsed', { path: '/networking' })
  })
})

describe('emitFixerViewed', () => {
  it('sends ksc_fixer_viewed with title and cncf_project', () => {
    emitFixerViewed('Cert Manager Fix', 'cert-manager')
    expect(mockSend).toHaveBeenCalledWith('ksc_fixer_viewed', {
      title: 'Cert Manager Fix',
      cncf_project: 'cert-manager',
    })
  })

  it('defaults cncf_project to empty string when omitted', () => {
    emitFixerViewed('My Fix')
    expect(mockSend.mock.calls[0][1].cncf_project).toBe('')
  })
})

describe('emitFixerImported', () => {
  it('sends ksc_fixer_imported with title and cncf_project', () => {
    emitFixerImported('My Fixer', 'flux')
    expect(mockSend).toHaveBeenCalledWith('ksc_fixer_imported', {
      title: 'My Fixer',
      cncf_project: 'flux',
    })
  })
})

describe('emitFixerImportError', () => {
  it('sends ksc_fixer_import_error with title, error_count, first_error', () => {
    emitFixerImportError('My Fixer', 2, 'parse error at line 5')
    expect(mockSend).toHaveBeenCalledWith('ksc_fixer_import_error', {
      title: 'My Fixer',
      error_count: '2',
      first_error: 'parse error at line 5',
    })
  })

  it('truncates first_error to 100 characters', () => {
    emitFixerImportError('x', 1, 'e'.repeat(200))
    expect(mockSend.mock.calls[0][1].first_error).toHaveLength(100)
  })
})

describe('emitFixerLinkCopied', () => {
  it('sends ksc_fixer_link_copied', () => {
    emitFixerLinkCopied('Fix Title', 'prometheus')
    expect(mockSend).toHaveBeenCalledWith('ksc_fixer_link_copied', {
      title: 'Fix Title',
      cncf_project: 'prometheus',
    })
  })
})

describe('emitFixerGitHubLink', () => {
  it('sends ksc_fixer_github_link with no payload', () => {
    emitFixerGitHubLink()
    expect(mockSend).toHaveBeenCalledWith('ksc_fixer_github_link')
  })
})

// ── Orbit ──────────────────────────────────────────────────────────

describe('emitOrbitMissionCreated', () => {
  it('sends ksc_orbit_mission_created with orbit_type and cadence', () => {
    emitOrbitMissionCreated('health-check', 'weekly')
    expect(mockSend).toHaveBeenCalledWith('ksc_orbit_mission_created', {
      orbit_type: 'health-check',
      cadence: 'weekly',
    })
  })
})

describe('emitOrbitMissionRun', () => {
  it('sends ksc_orbit_mission_run with orbit_type and result', () => {
    emitOrbitMissionRun('health-check', 'success')
    expect(mockSend).toHaveBeenCalledWith('ksc_orbit_mission_run', {
      orbit_type: 'health-check',
      result: 'success',
    })
  })
})

describe('emitGroundControlDashboardCreated', () => {
  it('sends ksc_ground_control_dashboard_created with card_count', () => {
    emitGroundControlDashboardCreated(5)
    expect(mockSend).toHaveBeenCalledWith('ksc_ground_control_dashboard_created', {
      card_count: 5,
    })
  })
})

describe('emitGroundControlCardRequestOpened', () => {
  it('sends ksc_ground_control_card_request with project', () => {
    emitGroundControlCardRequestOpened('my-project')
    expect(mockSend).toHaveBeenCalledWith('ksc_ground_control_card_request', {
      project: 'my-project',
    })
  })
})

// ── Deploy ──────────────────────────────────────────────────────────

describe('emitDeployWorkload', () => {
  it('sends ksc_deploy_workload', () => {
    emitDeployWorkload('nginx', 'prod-group')
    expect(mockSend).toHaveBeenCalledWith('ksc_deploy_workload', {
      workload_name: 'nginx',
      cluster_group: 'prod-group',
    })
  })
})

describe('emitDeployTemplateApplied', () => {
  it('sends ksc_deploy_template_applied', () => {
    emitDeployTemplateApplied('my-template')
    expect(mockSend).toHaveBeenCalledWith('ksc_deploy_template_applied', {
      template_name: 'my-template',
    })
  })
})

// ── Compliance ──────────────────────────────────────────────────────

describe('emitComplianceDrillDown', () => {
  it('sends ksc_compliance_drill_down with stat_type', () => {
    emitComplianceDrillDown('nist')
    expect(mockSend).toHaveBeenCalledWith('ksc_compliance_drill_down', { stat_type: 'nist' })
  })
})

describe('emitComplianceFilterChanged', () => {
  it('sends ksc_compliance_filter_changed with filter_type', () => {
    emitComplianceFilterChanged('severity')
    expect(mockSend).toHaveBeenCalledWith('ksc_compliance_filter_changed', {
      filter_type: 'severity',
    })
  })
})

// ── Benchmarks ──────────────────────────────────────────────────────

describe('emitBenchmarkViewed', () => {
  it('sends ksc_benchmark_viewed with benchmark_type', () => {
    emitBenchmarkViewed('cpu')
    expect(mockSend).toHaveBeenCalledWith('ksc_benchmark_viewed', { benchmark_type: 'cpu' })
  })
})

// ── Mission Suggestions ─────────────────────────────────────────────

describe('emitMissionSuggestionsShown', () => {
  it('sends ksc_mission_suggestions_shown with count and critical_count', () => {
    emitMissionSuggestionsShown(4, 1)
    expect(mockSend).toHaveBeenCalledWith('ksc_mission_suggestions_shown', {
      suggestion_count: 4,
      critical_count: 1,
    })
  })
})

describe('emitMissionSuggestionActioned', () => {
  it('sends ksc_mission_suggestion_actioned', () => {
    emitMissionSuggestionActioned('diagnose', 'high', 'launch')
    expect(mockSend).toHaveBeenCalledWith('ksc_mission_suggestion_actioned', {
      mission_type: 'diagnose',
      priority: 'high',
      action: 'launch',
    })
  })
})

// ── ACMM ────────────────────────────────────────────────────────────

describe('emitACMMScanned', () => {
  it('sends ksc_acmm_scanned with all dimensions', () => {
    emitACMMScanned('kubestellar/console', 3, 7, 10)
    expect(mockSend).toHaveBeenCalledWith('ksc_acmm_scanned', {
      repo: 'kubestellar/console',
      acmm_level: 3,
      detected: 7,
      total: 10,
    })
  })
})

describe('emitACMMMissionLaunched', () => {
  it('sends ksc_acmm_mission_launched with all dimensions', () => {
    emitACMMMissionLaunched('kubestellar/console', 'crit-1', 'community', 4)
    expect(mockSend).toHaveBeenCalledWith('ksc_acmm_mission_launched', {
      repo: 'kubestellar/console',
      criterion_id: 'crit-1',
      criterion_source: 'community',
      target_level: 4,
    })
  })
})

describe('emitACMMLevelMissionLaunched', () => {
  it('sends ksc_acmm_level_mission_launched with all dimensions', () => {
    emitACMMLevelMissionLaunched('kubestellar/console', 4, 5)
    expect(mockSend).toHaveBeenCalledWith('ksc_acmm_level_mission_launched', {
      repo: 'kubestellar/console',
      target_level: 4,
      criteria_count: 5,
    })
  })
})
