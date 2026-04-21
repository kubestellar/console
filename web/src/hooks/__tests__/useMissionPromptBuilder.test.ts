import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock useResolutions so buildEnhancedPrompt pure logic is exercised without side effects
vi.mock('../useResolutions', () => ({
  detectIssueSignature: vi.fn(() => ({ type: null })),
  findSimilarResolutionsStandalone: vi.fn(() => []),
  generateResolutionPromptContext: vi.fn(() => ''),
}))

import {
  generateMessageId,
  buildEnhancedPrompt,
  buildSystemMessages,
  stripInteractiveArtifacts,
  buildSavedMissionPrompt,
} from '../useMissionPromptBuilder'
import type { StartMissionParams, Mission, MatchedResolution } from '../useMissionTypes'

function makeStartParams(overrides: Partial<StartMissionParams> = {}): StartMissionParams {
  return {
    title: 'Test mission',
    description: 'A test',
    type: 'troubleshoot',
    initialPrompt: 'Fix the pod',
    ...overrides,
  }
}

describe('generateMessageId', () => {
  it('returns a string ID', () => {
    expect(typeof generateMessageId()).toBe('string')
  })

  it('starts with "msg-"', () => {
    expect(generateMessageId()).toMatch(/^msg-/)
  })

  it('produces unique IDs on successive calls', () => {
    const ids = Array.from({ length: 5 }, () => generateMessageId())
    expect(new Set(ids).size).toBe(5)
  })

  it('includes the suffix when provided', () => {
    expect(generateMessageId('nointeractive')).toContain('nointeractive')
  })
})

describe('buildEnhancedPrompt', () => {
  it('returns initialPrompt unchanged when no cluster and no dryRun', () => {
    const params = makeStartParams({ initialPrompt: 'Fix the pod', type: 'upgrade' })
    const { enhancedPrompt } = buildEnhancedPrompt(params)
    expect(enhancedPrompt).toContain('Fix the pod')
  })

  it('injects cluster context for single cluster', () => {
    const params = makeStartParams({ cluster: 'prod-cluster', type: 'upgrade' })
    const { enhancedPrompt } = buildEnhancedPrompt(params)
    expect(enhancedPrompt).toContain('Target cluster: prod-cluster')
    expect(enhancedPrompt).toContain('--context=prod-cluster')
  })

  it('injects multi-cluster context for comma-separated clusters', () => {
    const params = makeStartParams({ cluster: 'cluster-a,cluster-b', type: 'upgrade' })
    const { enhancedPrompt } = buildEnhancedPrompt(params)
    expect(enhancedPrompt).toContain('Target clusters: cluster-a, cluster-b')
    expect(enhancedPrompt).toContain('--context=cluster-a')
    expect(enhancedPrompt).toContain('--context=cluster-b')
  })

  it('injects dry-run instructions when dryRun is true', () => {
    const params = makeStartParams({ dryRun: true, type: 'upgrade' })
    const { enhancedPrompt } = buildEnhancedPrompt(params)
    expect(enhancedPrompt).toContain('DRY RUN MODE')
    expect(enhancedPrompt).toContain('--dry-run=server')
  })

  it('marks deploy missions as install missions', () => {
    const params = makeStartParams({ type: 'deploy' })
    const { isInstallMission } = buildEnhancedPrompt(params)
    expect(isInstallMission).toBe(true)
  })

  it('marks "install" in title as install mission', () => {
    const params = makeStartParams({ title: 'Install cert-manager', type: 'troubleshoot' })
    const { isInstallMission } = buildEnhancedPrompt(params)
    expect(isInstallMission).toBe(true)
  })

  it('returns empty matchedResolutions when no signature detected', () => {
    const params = makeStartParams({ type: 'upgrade' })
    const { matchedResolutions } = buildEnhancedPrompt(params)
    expect(matchedResolutions).toHaveLength(0)
  })

  it('injects non-interactive warning for install missions', () => {
    const params = makeStartParams({ type: 'deploy' })
    const { enhancedPrompt } = buildEnhancedPrompt(params)
    expect(enhancedPrompt).toContain('non-interactive terminal')
  })
})

describe('buildSystemMessages', () => {
  it('returns empty array when not install mission and no resolutions', () => {
    expect(buildSystemMessages(false, [])).toHaveLength(0)
  })

  it('adds non-interactive message for install mission', () => {
    const msgs = buildSystemMessages(true, [])
    expect(msgs).toHaveLength(1)
    expect(msgs[0].role).toBe('system')
    expect(msgs[0].content).toContain('Non-interactive mode')
  })

  it('adds resolution message when resolutions are provided', () => {
    const resolutions: MatchedResolution[] = [
      { id: 'r1', title: 'Restart pod', similarity: 0.9, source: 'personal' },
    ]
    const msgs = buildSystemMessages(false, resolutions)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].content).toContain('similar resolution')
    expect(msgs[0].content).toContain('Restart pod')
  })

  it('uses plural "resolutions" for multiple matches', () => {
    const resolutions: MatchedResolution[] = [
      { id: 'r1', title: 'Fix A', similarity: 0.8, source: 'personal' },
      { id: 'r2', title: 'Fix B', similarity: 0.7, source: 'shared' },
    ]
    const msgs = buildSystemMessages(false, resolutions)
    expect(msgs[0].content).toContain('2 similar resolutions')
  })

  it('all messages have id, role, content, timestamp fields', () => {
    const msgs = buildSystemMessages(true, [])
    for (const msg of msgs) {
      expect(msg.id).toBeTruthy()
      expect(msg.role).toBe('system')
      expect(msg.content).toBeTruthy()
      expect(msg.timestamp).toBeInstanceOf(Date)
    }
  })
})

describe('stripInteractiveArtifacts', () => {
  it('passes through clean text unchanged', () => {
    expect(stripInteractiveArtifacts('hello world')).toBe('hello world')
  })

  it('returns empty string for empty input', () => {
    expect(stripInteractiveArtifacts('')).toBe('')
  })

  it('removes ANSI escape codes', () => {
    const input = '\x1B[31mred text\x1B[0m'
    expect(stripInteractiveArtifacts(input)).toBe('red text')
  })

  it('removes interactive prompt indicators at line start', () => {
    const input = '? Select an option\n> My choice'
    const result = stripInteractiveArtifacts(input)
    expect(result).not.toContain('?')
    expect(result).not.toContain('>')
  })

  it('removes carriage returns', () => {
    const input = 'line1\r\nline2'
    expect(stripInteractiveArtifacts(input)).not.toContain('\r')
  })

  it('collapses multiple newlines to single newline', () => {
    const input = 'a\n\n\nb'
    expect(stripInteractiveArtifacts(input)).toBe('a\nb')
  })
})

describe('buildSavedMissionPrompt', () => {
  it('returns description when no importedFrom steps', () => {
    const mission = { description: 'Deploy nginx', importedFrom: undefined } as Pick<Mission, 'description' | 'importedFrom'>
    expect(buildSavedMissionPrompt(mission)).toBe('Deploy nginx')
  })

  it('appends numbered steps when importedFrom.steps present', () => {
    const mission: Pick<Mission, 'description' | 'importedFrom'> = {
      description: 'Deploy app',
      importedFrom: {
        title: 'Deploy',
        description: 'Deploy the app',
        steps: [
          { title: 'Step 1', description: 'Pull image' },
          { title: 'Step 2', description: 'Run container' },
        ],
      },
    }
    const result = buildSavedMissionPrompt(mission)
    expect(result).toContain('Deploy app')
    expect(result).toContain('1. Step 1: Pull image')
    expect(result).toContain('2. Step 2: Run container')
  })

  it('returns description when importedFrom has no steps', () => {
    const mission: Pick<Mission, 'description' | 'importedFrom'> = {
      description: 'Troubleshoot issue',
      importedFrom: { title: 'T', description: 'D' },
    }
    expect(buildSavedMissionPrompt(mission)).toBe('Troubleshoot issue')
  })
})
