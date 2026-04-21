import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateMessageId,
  buildEnhancedPrompt,
  buildSystemMessages,
  stripInteractiveArtifacts,
  buildSavedMissionPrompt,
} from './useMissionPromptBuilder'
import type { StartMissionParams, MatchedResolution } from './useMissionTypes'

vi.mock('./useResolutions', () => ({
  detectIssueSignature: vi.fn(() => ({ type: 'Unknown' })),
  findSimilarResolutionsStandalone: vi.fn(() => []),
  generateResolutionPromptContext: vi.fn(() => ''),
}))

import { detectIssueSignature, findSimilarResolutionsStandalone, generateResolutionPromptContext } from './useResolutions'

const mockDetect = vi.mocked(detectIssueSignature)
const mockFind = vi.mocked(findSimilarResolutionsStandalone)
const mockGenerate = vi.mocked(generateResolutionPromptContext)

function makeParams(overrides: Partial<StartMissionParams> = {}): StartMissionParams {
  return {
    initialPrompt: 'Fix the broken pod',
    title: 'Fix pod',
    description: 'Pod keeps crashing',
    type: 'chat',
    ...overrides,
  } as StartMissionParams
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDetect.mockReturnValue({ type: 'Unknown' })
  mockFind.mockReturnValue([])
  mockGenerate.mockReturnValue('')
})

// ── generateMessageId ───────────────────────────────────────────────────────

describe('generateMessageId', () => {
  it('returns a string starting with msg-', () => {
    expect(generateMessageId()).toMatch(/^msg-/)
  })

  it('returns unique IDs on consecutive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateMessageId()))
    expect(ids.size).toBe(20)
  })

  it('appends suffix when provided', () => {
    expect(generateMessageId('system')).toMatch(/-system$/)
  })

  it('has no trailing dash when no suffix provided', () => {
    expect(generateMessageId()).not.toMatch(/-$/)
  })

  it('includes a timestamp component', () => {
    const before = Date.now()
    const id = generateMessageId()
    const after = Date.now()
    const parts = id.split('-')
    const ts = Number(parts[1])
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })
})

// ── buildEnhancedPrompt ─────────────────────────────────────────────────────

describe('buildEnhancedPrompt', () => {
  it('returns original prompt when no cluster or dryRun', () => {
    const { enhancedPrompt } = buildEnhancedPrompt(makeParams())
    expect(enhancedPrompt).toBe('Fix the broken pod')
  })

  it('prepends single-cluster targeting instructions', () => {
    const { enhancedPrompt } = buildEnhancedPrompt(makeParams({ cluster: 'my-cluster' }))
    expect(enhancedPrompt).toContain('Target cluster: my-cluster')
    expect(enhancedPrompt).toContain('--context=my-cluster')
  })

  it('prepends multi-cluster targeting with per-cluster instructions', () => {
    const { enhancedPrompt } = buildEnhancedPrompt(makeParams({ cluster: 'cluster-a, cluster-b' }))
    expect(enhancedPrompt).toContain('Target clusters: cluster-a, cluster-b')
    expect(enhancedPrompt).toContain('--context=cluster-a')
    expect(enhancedPrompt).toContain('--context=cluster-b')
  })

  it('trims whitespace from cluster names', () => {
    const { enhancedPrompt } = buildEnhancedPrompt(makeParams({ cluster: '  my-cluster  ' }))
    expect(enhancedPrompt).toContain('Target cluster: my-cluster')
  })

  it('appends dry-run instructions when dryRun is true', () => {
    const { enhancedPrompt } = buildEnhancedPrompt(makeParams({ dryRun: true }))
    expect(enhancedPrompt).toContain('DRY RUN MODE')
    expect(enhancedPrompt).toContain('DRY RUN COMPLETE')
  })

  it('does not append dry-run instructions when dryRun is false', () => {
    const { enhancedPrompt } = buildEnhancedPrompt(makeParams({ dryRun: false }))
    expect(enhancedPrompt).not.toContain('DRY RUN MODE')
  })

  it('appends non-interactive notice for deploy type missions', () => {
    const { enhancedPrompt, isInstallMission } = buildEnhancedPrompt(makeParams({ type: 'deploy' }))
    expect(enhancedPrompt).toContain('non-interactive terminal')
    expect(isInstallMission).toBe(true)
  })

  it('appends non-interactive notice for titles containing "install"', () => {
    const { enhancedPrompt, isInstallMission } = buildEnhancedPrompt(makeParams({ title: 'Install Helm chart' }))
    expect(enhancedPrompt).toContain('non-interactive terminal')
    expect(isInstallMission).toBe(true)
  })

  it('does not append non-interactive notice for chat missions', () => {
    const { isInstallMission } = buildEnhancedPrompt(makeParams({ type: 'chat', title: 'Debug issue' }))
    expect(isInstallMission).toBe(false)
  })

  it('returns empty matchedResolutions when type is deploy', () => {
    const { matchedResolutions } = buildEnhancedPrompt(makeParams({ type: 'deploy' }))
    expect(matchedResolutions).toEqual([])
    expect(mockFind).not.toHaveBeenCalled()
  })

  it('returns empty matchedResolutions when signature type is Unknown', () => {
    mockDetect.mockReturnValue({ type: 'Unknown' })
    const { matchedResolutions } = buildEnhancedPrompt(makeParams({ type: 'chat' }))
    expect(matchedResolutions).toEqual([])
  })

  it('injects resolution context when matching resolutions are found', () => {
    mockDetect.mockReturnValue({ type: 'CrashLoopBackOff', resourceKind: 'Pod', errorPattern: '' })
    mockFind.mockReturnValue([
      {
        resolution: { id: 'res-1', title: 'Fix OOM kill' },
        similarity: 0.9,
        source: 'personal',
      } as unknown as ReturnType<typeof findSimilarResolutionsStandalone>[0],
    ])
    mockGenerate.mockReturnValue('\n\nPast resolution context')

    const { matchedResolutions, enhancedPrompt } = buildEnhancedPrompt(makeParams({ type: 'chat' }))
    expect(matchedResolutions).toHaveLength(1)
    expect(matchedResolutions[0].id).toBe('res-1')
    expect(enhancedPrompt).toContain('Past resolution context')
  })
})

// ── buildSystemMessages ─────────────────────────────────────────────────────

describe('buildSystemMessages', () => {
  it('returns [] when not an install mission and no resolutions', () => {
    expect(buildSystemMessages(false, [])).toEqual([])
  })

  it('adds non-interactive warning for install missions', () => {
    const msgs = buildSystemMessages(true, [])
    expect(msgs).toHaveLength(1)
    expect(msgs[0].role).toBe('system')
    expect(msgs[0].content).toContain('Non-interactive mode')
  })

  it('adds resolution message when matchedResolutions is non-empty', () => {
    const resolutions: MatchedResolution[] = [
      { id: 'r1', title: 'Fix DNS', similarity: 0.85, source: 'personal' },
    ]
    const msgs = buildSystemMessages(false, resolutions)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].content).toContain('Fix DNS')
    expect(msgs[0].content).toContain('85%')
    expect(msgs[0].content).toContain('your history')
  })

  it('shows "team knowledge" for non-personal resolution sources', () => {
    const resolutions: MatchedResolution[] = [
      { id: 'r1', title: 'Restart pod', similarity: 0.7, source: 'team' as unknown as 'personal' },
    ]
    const msgs = buildSystemMessages(false, resolutions)
    expect(msgs[0].content).toContain('team knowledge')
  })

  it('adds both messages for install mission with resolutions', () => {
    const resolutions: MatchedResolution[] = [
      { id: 'r1', title: 'Fix deploy', similarity: 0.6, source: 'personal' },
    ]
    const msgs = buildSystemMessages(true, resolutions)
    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe('system')
    expect(msgs[1].role).toBe('system')
  })

  it('uses plural form when multiple resolutions match', () => {
    const resolutions: MatchedResolution[] = [
      { id: 'r1', title: 'Fix A', similarity: 0.8, source: 'personal' },
      { id: 'r2', title: 'Fix B', similarity: 0.6, source: 'personal' },
    ]
    const msgs = buildSystemMessages(false, resolutions)
    expect(msgs[0].content).toContain('2 similar resolutions')
  })

  it('each message has a unique id', () => {
    const resolutions: MatchedResolution[] = [
      { id: 'r1', title: 'Fix', similarity: 0.9, source: 'personal' },
    ]
    const msgs = buildSystemMessages(true, resolutions)
    const ids = msgs.map(m => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ── stripInteractiveArtifacts ───────────────────────────────────────────────

describe('stripInteractiveArtifacts', () => {
  it('returns the original string when nothing to strip', () => {
    expect(stripInteractiveArtifacts('hello world')).toBe('hello world')
  })

  it('returns empty-ish string for empty input', () => {
    expect(stripInteractiveArtifacts('')).toBe('')
  })

  it('removes ANSI escape codes', () => {
    expect(stripInteractiveArtifacts('\x1B[32mGreen text\x1B[0m')).toBe('Green text')
  })

  it('removes leading ? prompt indicators', () => {
    expect(stripInteractiveArtifacts('? Choose an option')).toBe('Choose an option')
  })

  it('removes leading > selection indicators', () => {
    expect(stripInteractiveArtifacts('> Selected item')).toBe('Selected item')
  })

  it('removes interactive menu item lines', () => {
    const input = '  - [x] Option A\n  - [ ] Option B'
    const result = stripInteractiveArtifacts(input)
    expect(result).not.toContain('[x]')
    expect(result).not.toContain('[ ]')
  })

  it('removes carriage returns', () => {
    expect(stripInteractiveArtifacts('line1\r\nline2')).not.toContain('\r')
  })

  it('collapses multiple blank lines into one', () => {
    const result = stripInteractiveArtifacts('a\n\n\n\nb')
    expect(result).toBe('a\nb')
  })

  it('trims leading and trailing whitespace', () => {
    expect(stripInteractiveArtifacts('  hello  ')).toBe('hello')
  })

  it('handles null/undefined-like falsy input (empty string)', () => {
    expect(stripInteractiveArtifacts('')).toBe('')
  })
})

// ── buildSavedMissionPrompt ─────────────────────────────────────────────────

describe('buildSavedMissionPrompt', () => {
  it('returns description when no importedFrom steps', () => {
    const result = buildSavedMissionPrompt({ description: 'Do a thing', importedFrom: undefined })
    expect(result).toBe('Do a thing')
  })

  it('appends numbered steps when importedFrom.steps is present', () => {
    const result = buildSavedMissionPrompt({
      description: 'Deploy app',
      importedFrom: {
        steps: [
          { title: 'Build', description: 'Run npm build' },
          { title: 'Deploy', description: 'Run kubectl apply' },
        ],
      } as unknown as Mission['importedFrom'],
    })
    expect(result).toContain('Deploy app')
    expect(result).toContain('1. Build: Run npm build')
    expect(result).toContain('2. Deploy: Run kubectl apply')
  })

  it('uses description alone when importedFrom has no steps property', () => {
    const result = buildSavedMissionPrompt({
      description: 'Simple task',
      importedFrom: {} as unknown as Mission['importedFrom'],
    })
    expect(result).toBe('Simple task')
  })
})
