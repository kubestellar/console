/**
 * Targeted coverage for the one untested function in analytics-events/missions.ts:
 *   emitMissionToolMissing
 *
 * Mirrors the emitMissionError test style — verifies error_detail truncation,
 * whitespace trimming, and missing-tool payload structure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../analytics-core', () => ({
  send: vi.fn(),
}))

import { send } from '../analytics-core'
import { emitMissionToolMissing } from '../analytics-events/missions'

const mockSend = vi.mocked(send)

beforeEach(() => {
  mockSend.mockClear()
})

describe('emitMissionToolMissing', () => {
  it('sends ksc_mission_tool_missing with type and tool when no detail', () => {
    emitMissionToolMissing('deploy', 'kubectl')
    expect(mockSend).toHaveBeenCalledWith('ksc_mission_tool_missing', {
      mission_type: 'deploy',
      missing_tool: 'kubectl',
      error_detail: '',
    })
  })

  it('includes error_detail when provided', () => {
    emitMissionToolMissing('scan', 'trivy', 'trivy binary not found in PATH')
    expect(mockSend).toHaveBeenCalledWith('ksc_mission_tool_missing', {
      mission_type: 'scan',
      missing_tool: 'trivy',
      error_detail: 'trivy binary not found in PATH',
    })
  })

  it('truncates error_detail to 100 chars', () => {
    const longDetail = 'x'.repeat(150)
    emitMissionToolMissing('install', 'helm', longDetail)
    expect(mockSend).toHaveBeenCalledWith('ksc_mission_tool_missing', {
      mission_type: 'install',
      missing_tool: 'helm',
      error_detail: 'x'.repeat(100),
    })
  })

  it('trims whitespace from error_detail before truncating', () => {
    const paddedDetail = '  missing binary  '
    emitMissionToolMissing('upgrade', 'flux', paddedDetail)
    expect(mockSend).toHaveBeenCalledWith('ksc_mission_tool_missing', {
      mission_type: 'upgrade',
      missing_tool: 'flux',
      error_detail: 'missing binary',
    })
  })

  it('sends empty error_detail for whitespace-only string', () => {
    emitMissionToolMissing('deploy', 'kustomize', '   ')
    expect(mockSend).toHaveBeenCalledWith('ksc_mission_tool_missing', {
      mission_type: 'deploy',
      missing_tool: 'kustomize',
      error_detail: '',
    })
  })

  it('preserves exactly 100 chars when detail is exactly 100 chars long', () => {
    const exactDetail = 'a'.repeat(100)
    emitMissionToolMissing('check', 'kubeconform', exactDetail)
    expect(mockSend).toHaveBeenCalledWith('ksc_mission_tool_missing', {
      mission_type: 'check',
      missing_tool: 'kubeconform',
      error_detail: exactDetail,
    })
  })

  it('calls send exactly once per invocation', () => {
    emitMissionToolMissing('lint', 'golangci-lint')
    expect(mockSend).toHaveBeenCalledTimes(1)
  })
})
