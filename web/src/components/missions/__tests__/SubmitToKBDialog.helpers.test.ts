import { describe, expect, it } from 'vitest'

import {
  CNCF_PROJECT_KEYWORDS,
  CONSOLE_KB_BRANCH,
  CONSOLE_KB_OWNER,
  CONSOLE_KB_REPO,
  MAX_GITHUB_URL_LENGTH,
  detectCNCFProject,
  generateFilename,
  resolutionToKBFormat,
} from '../SubmitToKBDialog.helpers'
import type { Resolution } from '../../../hooks/useResolutions'

// ─── Fixtures ──────────────────────────────────────────────────────────────

function makeResolution(overrides: Partial<Resolution> = {}): Resolution {
  return {
    id: 'r-1',
    missionId: 'm-1',
    userId: 'user@example.com',
    title: 'Fix crashing pods',
    visibility: 'private',
    issueSignature: {
      type: 'CrashLoopBackOff',
      errorPattern: 'Back-off restarting failed container',
      resourceKind: 'Pod',
      namespace: 'default',
    },
    resolution: {
      summary: 'Increase memory limits',
      steps: ['kubectl top pod', 'kubectl edit deploy web'],
      yaml: undefined,
    },
    context: {
      cluster: 'prod',
      operators: [],
      k8sVersion: '1.29',
    },
    effectiveness: { timesUsed: 0, timesSuccessful: 0 },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    ...overrides,
  } as Resolution
}

// ─── Constants ──────────────────────────────────────────────────────────────

describe('kb constants', () => {
  it('point at the kubestellar/console-kb repo on the master branch', () => {
    expect(CONSOLE_KB_OWNER).toBe('kubestellar')
    expect(CONSOLE_KB_REPO).toBe('console-kb')
    expect(CONSOLE_KB_BRANCH).toBe('master')
  })

  it('MAX_GITHUB_URL_LENGTH is 7500 (under the ~8000 browser ceiling)', () => {
    expect(MAX_GITHUB_URL_LENGTH).toBe(7500)
    expect(MAX_GITHUB_URL_LENGTH).toBeLessThan(8000)
  })

  it('CNCF_PROJECT_KEYWORDS contains canonical entries for key CNCF projects', () => {
    expect(CNCF_PROJECT_KEYWORDS.kyverno).toBe('Kyverno')
    expect(CNCF_PROJECT_KEYWORDS.istio).toBe('Istio')
    expect(CNCF_PROJECT_KEYWORDS.argocd).toBe('Argo CD')
    expect(CNCF_PROJECT_KEYWORDS['argo cd']).toBe('Argo CD')
    expect(CNCF_PROJECT_KEYWORDS.kubestellar).toBe('KubeStellar')
    expect(CNCF_PROJECT_KEYWORDS['open policy agent']).toBe('OPA')
    expect(CNCF_PROJECT_KEYWORDS.gatekeeper).toBe('OPA Gatekeeper')
  })
})

// ─── detectCNCFProject ─────────────────────────────────────────────────────

describe('detectCNCFProject', () => {
  it('returns empty string when no keyword matches', () => {
    const r = makeResolution({ title: 'Nothing here', context: { operators: [] } })
    expect(detectCNCFProject(r)).toBe('')
  })

  it('detects from the operators list (exact match, case-insensitive)', () => {
    const r = makeResolution({ title: 'Random title', context: { operators: ['Kyverno'] } })
    expect(detectCNCFProject(r)).toBe('Kyverno')
  })

  it('detects from an operator via substring match', () => {
    const r = makeResolution({ title: 'Random title', context: { operators: ['istio-system-controller'] } })
    expect(detectCNCFProject(r)).toBe('Istio')
  })

  it('detects Argo CD from the "argocd" alias in the title', () => {
    const r = makeResolution({ title: 'ArgoCD sync failed', context: { operators: [] } })
    expect(detectCNCFProject(r)).toBe('Argo CD')
  })

  it('detects from the namespace when the title has no keyword', () => {
    const r = makeResolution({
      title: 'Generic issue',
      issueSignature: { type: 'X', namespace: 'cert-manager' },
      context: { operators: [] },
    })
    expect(detectCNCFProject(r)).toBe('cert-manager')
  })

  it('detects from resolution.summary when title/namespace do not match', () => {
    const r = makeResolution({
      title: 'Generic issue',
      issueSignature: { type: 'X' },
      resolution: { summary: 'The prometheus scrape config is broken', steps: [] },
      context: { operators: [] },
    })
    expect(detectCNCFProject(r)).toBe('Prometheus')
  })

  it('detects from resolution.steps when nothing else matches', () => {
    const r = makeResolution({
      title: 'Generic issue',
      issueSignature: { type: 'X' },
      resolution: { summary: 'Fix', steps: ['helm upgrade grafana grafana/grafana'] },
      context: { operators: [] },
    })
    expect(detectCNCFProject(r)).toBe('Grafana')
  })

  it('is case-insensitive across all detection paths', () => {
    const r = makeResolution({ title: 'FLUX reconciliation stuck', context: { operators: [] } })
    expect(detectCNCFProject(r)).toBe('Flux')
  })
})

// ─── resolutionToKBFormat ───────────────────────────────────────────────────

describe('resolutionToKBFormat', () => {
  it('emits kc-mission-v1 envelope with steps mapped to {title, description}', () => {
    const r = makeResolution({
      resolution: { summary: 'Do the thing', steps: ['one', 'two'], yaml: undefined },
    })
    const out = resolutionToKBFormat(r, 'fixer', 'Kyverno') as Record<string, unknown>
    expect(out.version).toBe('kc-mission-v1')
    expect(out.title).toBe('Fix crashing pods')
    expect(out.description).toBe('Do the thing')
    expect(out.type).toBe('troubleshoot')
    expect(out.category).toBe('troubleshooting')
    expect(out.missionClass).toBe('fixer')
    expect(out.cncfProject).toBe('Kyverno')
    const mission = out.mission as Record<string, unknown>
    expect(mission.steps).toEqual([
      { title: 'Step 1', description: 'one' },
      { title: 'Step 2', description: 'two' },
    ])
  })

  it('uses "deploy"/"installation" type for missionClass=install', () => {
    const out = resolutionToKBFormat(makeResolution(), 'install', 'Kyverno') as Record<string, unknown>
    expect(out.type).toBe('deploy')
    expect(out.category).toBe('installation')
  })

  it('adds a troubleshooting entry when missionClass=fixer AND summary is present', () => {
    const r = makeResolution({
      issueSignature: { type: 'CrashLoopBackOff' },
      resolution: { summary: 'Some summary', steps: ['a'] },
    })
    const out = resolutionToKBFormat(r, 'fixer', '') as Record<string, unknown>
    const mission = out.mission as Record<string, unknown>
    expect(mission.troubleshooting).toEqual([{ title: 'CrashLoopBackOff', description: 'Some summary' }])
  })

  it('omits troubleshooting when missionClass=install even with a summary', () => {
    const r = makeResolution({ resolution: { summary: 'summary', steps: ['a'] } })
    const out = resolutionToKBFormat(r, 'install', '') as Record<string, unknown>
    const mission = out.mission as Record<string, unknown>
    expect(mission.troubleshooting).toBeUndefined()
  })

  it('omits the cncfProject key entirely when no project was detected', () => {
    const out = resolutionToKBFormat(makeResolution(), 'fixer', '') as Record<string, unknown>
    expect(out.cncfProject).toBeUndefined()
  })

  it('includes yaml when the resolution carries one', () => {
    const r = makeResolution({ resolution: { summary: 's', steps: ['a'], yaml: 'kind: Deployment' } })
    const out = resolutionToKBFormat(r, 'fixer', 'Kyverno') as Record<string, unknown>
    const mission = out.mission as Record<string, unknown>
    const resolution = mission.resolution as Record<string, unknown>
    expect(resolution.yaml).toBe('kind: Deployment')
  })

  it('omits mission.resolution when summary is empty and steps are empty', () => {
    const r = makeResolution({ resolution: { summary: '', steps: [] } })
    const out = resolutionToKBFormat(r, 'fixer', '') as Record<string, unknown>
    const mission = out.mission as Record<string, unknown>
    expect(mission.resolution).toBeUndefined()
  })

  it('builds tags from issue type + resourceKind + cncfProject (dedup falsy)', () => {
    const r = makeResolution({
      issueSignature: { type: 'CrashLoopBackOff', resourceKind: 'Pod' },
    })
    const out = resolutionToKBFormat(r, 'fixer', 'Kyverno') as Record<string, unknown>
    expect(out.tags).toEqual(['CrashLoopBackOff', 'Pod', 'Kyverno'])
  })

  it('drops resourceKind and cncfProject from tags when they are empty', () => {
    const r = makeResolution({ issueSignature: { type: 'CrashLoopBackOff' } })
    const out = resolutionToKBFormat(r, 'fixer', '') as Record<string, unknown>
    expect(out.tags).toEqual(['CrashLoopBackOff'])
  })

  it('uses sharedBy for the metadata.author when set, else userId', () => {
    const shared = resolutionToKBFormat(
      makeResolution({ sharedBy: 'alice', userId: 'bob' }), 'fixer', '') as Record<string, unknown>
    expect((shared.metadata as Record<string, unknown>).author).toBe('alice')
    const priv = resolutionToKBFormat(
      makeResolution({ sharedBy: undefined, userId: 'bob' }), 'fixer', '') as Record<string, unknown>
    expect((priv.metadata as Record<string, unknown>).author).toBe('bob')
  })

  it('metadata carries createdAt/updatedAt and marks source as kubestellar-console', () => {
    const out = resolutionToKBFormat(makeResolution(), 'fixer', '') as Record<string, unknown>
    const md = out.metadata as Record<string, unknown>
    expect(md.source).toBe('kubestellar-console')
    expect(md.createdAt).toBe('2026-01-01T00:00:00Z')
    expect(md.updatedAt).toBe('2026-01-02T00:00:00Z')
  })

  it('falls back to title when resolution.summary is empty', () => {
    const r = makeResolution({ title: 'Fallback title', resolution: { summary: '', steps: ['a'] } })
    const out = resolutionToKBFormat(r, 'fixer', '') as Record<string, unknown>
    expect(out.description).toBe('Fallback title')
  })
})

// ─── generateFilename ───────────────────────────────────────────────────────

describe('generateFilename', () => {
  it('emits install-<slug>.json for missionClass=install', () => {
    expect(generateFilename('Install Karmada CRDs', 'install')).toBe('install-install-karmada-crds.json')
  })

  it('emits fixer-<slug>.json for missionClass=fixer', () => {
    expect(generateFilename('Fix CrashLoopBackOff', 'fixer')).toBe('fixer-fix-crashloopbackoff.json')
  })

  it('collapses runs of non-alphanumeric characters into single hyphens', () => {
    expect(generateFilename('Foo & Bar!! (v2)', 'fixer')).toBe('fixer-foo-bar-v2.json')
  })

  it('lower-cases uppercase input', () => {
    expect(generateFilename('KUBERNETES SUPPORT', 'fixer')).toBe('fixer-kubernetes-support.json')
  })

  it('strips leading and trailing hyphens from the slug', () => {
    expect(generateFilename('---edge case---', 'fixer')).toBe('fixer-edge-case.json')
  })

  it('caps the slug at 60 characters', () => {
    const title = 'a'.repeat(200)
    const out = generateFilename(title, 'fixer')
    // "fixer-" prefix + 60 slug chars + ".json"
    expect(out).toBe(`fixer-${'a'.repeat(60)}.json`)
  })
})
