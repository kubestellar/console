import { describe, it, expect } from 'vitest'
import { matchInstallIntent } from '../intentMatcher'
import type { MissionExport } from '../types'

function mission(overrides: Partial<MissionExport> = {}): MissionExport {
  return {
    version: 'kc-mission-v1',
    title: 'Example',
    description: '',
    type: 'deploy',
    tags: [],
    steps: [{ title: 'Step 1', description: '' }],
    ...overrides,
  }
}

const opa = mission({
  name: 'install-open-policy-agent-opa',
  title: 'Install Open Policy Agent',
  cncfProject: 'opa',
  tags: ['policy', 'admission'],
})

const cilium = mission({
  name: 'install-cilium',
  title: 'Install Cilium CNI',
  cncfProject: 'cilium',
  tags: ['cni', 'networking'],
})

const argo = mission({
  name: 'install-argo-cd',
  title: 'Install Argo CD',
  cncfProject: 'argo-cd',
  tags: ['gitops'],
})

const installers = [opa, cilium, argo]

describe('matchInstallIntent — no intent detected', () => {
  it('returns null for empty prompt', () => {
    expect(matchInstallIntent('', installers)).toBeNull()
  })

  it('returns null for prompt without install verb', () => {
    expect(matchInstallIntent('what is cilium?', installers)).toBeNull()
  })

  it('returns null when install verb has no target', () => {
    expect(matchInstallIntent('install', installers)).toBeNull()
    expect(matchInstallIntent('please install', installers)).toBeNull()
  })

  it('returns null when target slugifies to empty (only punctuation)', () => {
    expect(matchInstallIntent('install ???', installers)).toBeNull()
  })
})

describe('matchInstallIntent — verb variants', () => {
  it.each([
    ['install cilium'],
    ['set up cilium'],
    ['deploy cilium'],
    ['provision cilium'],
    ['add cilium'],
  ])('recognizes verb in %s', (prompt) => {
    expect(matchInstallIntent(prompt, installers)).toBe(cilium)
  })

  it('is case-insensitive on the verb', () => {
    expect(matchInstallIntent('INSTALL cilium', installers)).toBe(cilium)
    expect(matchInstallIntent('Deploy Cilium', installers)).toBe(cilium)
  })

  it('accepts a "please" politeness prefix before the verb', () => {
    expect(matchInstallIntent('please install cilium', installers)).toBe(cilium)
  })
})

describe('matchInstallIntent — target normalization', () => {
  it('strips trailing punctuation from the target', () => {
    expect(matchInstallIntent('install cilium?', installers)).toBe(cilium)
    expect(matchInstallIntent('install cilium!!!', installers)).toBe(cilium)
    expect(matchInstallIntent('install cilium.', installers)).toBe(cilium)
  })

  it('strips a trailing "please"', () => {
    expect(matchInstallIntent('install cilium please', installers)).toBe(cilium)
  })

  it('strips leading article the/a/an', () => {
    expect(matchInstallIntent('install the cilium', installers)).toBe(cilium)
    expect(matchInstallIntent('install a cilium', installers)).toBe(cilium)
    expect(matchInstallIntent('install an argo cd', installers)).toBe(argo)
  })

  it('splits on trailing context words (on/in/to/for/with/using/via)', () => {
    expect(matchInstallIntent('install cilium on my cluster', installers)).toBe(cilium)
    expect(matchInstallIntent('install cilium in kind', installers)).toBe(cilium)
    expect(matchInstallIntent('install cilium to prod', installers)).toBe(cilium)
    expect(matchInstallIntent('install cilium for testing', installers)).toBe(cilium)
    expect(matchInstallIntent('install cilium with helm', installers)).toBe(cilium)
    expect(matchInstallIntent('install cilium using helm', installers)).toBe(cilium)
    expect(matchInstallIntent('install cilium via helm', installers)).toBe(cilium)
  })

  it('slugifies multi-word targets to install-<hyphen-joined>', () => {
    expect(matchInstallIntent('install argo cd', installers)).toBe(argo)
    expect(matchInstallIntent('install Argo CD please', installers)).toBe(argo)
  })
})

describe('matchInstallIntent — candidate resolution order', () => {
  it('prefers exact install-<slug> name match', () => {
    // "install open policy agent opa" → slug "open-policy-agent-opa"
    // → prefixed "install-open-policy-agent-opa" matches opa.name exactly.
    expect(matchInstallIntent('install open policy agent opa', installers)).toBe(opa)
  })

  it('falls back to cncfProject exact-slug match when no name match', () => {
    // slug "opa": no installer has name "install-opa" in this list,
    // but the first installer has cncfProject === "opa".
    const noNameMatch = [
      mission({ name: 'install-something-else', title: 'Other', cncfProject: 'opa' }),
    ]
    expect(matchInstallIntent('install opa', noNameMatch)).toBe(noNameMatch[0])
  })

  it('falls back to title substring match after cncfProject fails', () => {
    const list = [
      mission({ name: 'install-foo', title: 'Install Bar Baz', cncfProject: 'foo' }),
    ]
    // slug "baz" is not "install-foo" (name) or "foo" (cncfProject),
    // but title slug "install-bar-baz" contains "baz".
    expect(matchInstallIntent('install baz', list)).toBe(list[0])
  })

  it('falls back to token match (candidate term contains query slug)', () => {
    const list = [
      mission({
        name: 'install-something',
        title: 'Something',
        cncfProject: 'something',
        tags: ['observability-stack'],
      }),
    ]
    // slug "observability" → tag term "observability-stack" contains it
    expect(matchInstallIntent('install observability', list)).toBe(list[0])
  })

  it('falls back to token match (query slug contains candidate term)', () => {
    const list = [
      mission({
        name: 'install-something',
        title: 'Something',
        cncfProject: 'something',
        tags: ['obs'],
      }),
    ]
    // slug "observability" contains tag term "obs"
    expect(matchInstallIntent('install observability', list)).toBe(list[0])
  })

  it('returns null when nothing matches at any tier', () => {
    expect(matchInstallIntent('install nonexistent-project', installers)).toBeNull()
  })
})

describe('matchInstallIntent — degenerate inputs', () => {
  it('handles empty installers array', () => {
    expect(matchInstallIntent('install cilium', [])).toBeNull()
  })

  it('handles nullish installers via the `|| []` fallback', () => {
    // Bypass the type signature — the runtime guard exists specifically
    // for this case (callers may pass `undefined` before the KB has loaded).
    expect(matchInstallIntent('install cilium', undefined as unknown as MissionExport[])).toBeNull()
    expect(matchInstallIntent('install cilium', null as unknown as MissionExport[])).toBeNull()
  })

  it('tolerates missions with missing optional fields (no crash)', () => {
    const sparse = mission({
      name: undefined,
      title: '',
      cncfProject: undefined,
      tags: undefined,
    })
    // Sparse installer produces only empty search terms — falls through to null.
    expect(matchInstallIntent('install cilium', [sparse])).toBeNull()
  })

  it('returns null when the target has no matching candidate', () => {
    // "install the" extracts slug "the" (the leading-article regex only
    // strips "the " with trailing whitespace, so a bare "the" survives).
    // None of the installers match "the" at any tier → null.
    expect(matchInstallIntent('install the', installers)).toBeNull()
  })
})

describe('matchInstallIntent — verb boundary', () => {
  it('does not treat "uninstall" or "reinstall" as install verbs', () => {
    // The regex prefix `(?:^|\b)` requires the verb to start at a word
    // boundary. In "uninstall"/"reinstall" the 'i' of install has no
    // preceding boundary (u/r and i are both word chars), so no match.
    expect(matchInstallIntent('uninstall cilium', installers)).toBeNull()
    expect(matchInstallIntent('reinstall cilium', installers)).toBeNull()
  })
})
