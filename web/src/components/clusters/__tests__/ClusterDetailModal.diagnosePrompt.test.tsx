import { describe, expect, it } from 'vitest'

import { buildDiagnosePrompt, type DiagnosePromptInput } from '../diagnosePrompt'

const BASE_INPUT: Omit<DiagnosePromptInput, 'deploymentIssues'> = {
  clusterName: 'test-cluster',
  health: {
    nodeCount: 2,
    readyNodes: 2,
    podCount: 8,
    cpuCores: 4,
  },
  promptMemorySummary: '8 GB',
  totalGpuCount: 0,
  podIssues: [],
}

function buildPrompt(readyReplicas: number | null | undefined, totalReplicas: number | null | undefined): string {
  return buildDiagnosePrompt({
    ...BASE_INPUT,
    deploymentIssues: [{
      name: 'web',
      namespace: 'default',
      readyReplicas,
      replicas: totalReplicas,
    }],
  })
}

describe('buildDiagnosePrompt deployment replica counts', () => {
  it('renders the normal case as 1/3 ready', () => {
    expect(buildPrompt(1, 3)).toContain('1/3 ready')
  })

  it('never renders undefined/undefined ready', () => {
    const prompt = buildPrompt(undefined, undefined)

    expect(prompt).not.toContain('undefined/undefined ready')
    expect(prompt).not.toContain('undefined')
    expect(prompt).toContain('0/0 ready')
  })

  it('never renders undefined when total replicas are still loading', () => {
    const prompt = buildPrompt(0, undefined)

    expect(prompt).not.toContain('undefined')
    expect(prompt).toContain('0/0 ready')
  })

  it('renders zero replicas as 0/0 ready', () => {
    expect(buildPrompt(0, 0)).toContain('0/0 ready')
  })

  it('never renders null/null ready', () => {
    const prompt = buildPrompt(null, null)

    expect(prompt).not.toContain('null/null ready')
    expect(prompt).not.toContain('null')
    expect(prompt).toContain('0/0 ready')
  })

  it('generates a prompt for an empty deployments array without crashing', () => {
    const prompt = buildDiagnosePrompt({
      ...BASE_INPUT,
      deploymentIssues: [],
    })

    expect(prompt).toContain('Known issues (0 total):')
    expect(prompt).toContain('No known issues')
  })

  it('renders large replica counts as 100/100 ready', () => {
    expect(buildPrompt(100, 100)).toContain('100/100 ready')
  })
})
