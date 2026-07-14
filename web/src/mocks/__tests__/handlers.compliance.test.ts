// @vitest-environment node

/**
 * Unit tests for the split handlers.compliance.* modules introduced in #20970.
 *
 * Covers:
 *   - handlers.compliance.frameworks.ts  createComplianceFrameworkHandlers()
 *   - handlers.compliance.gov.ts         createComplianceGovHandlers()
 *   - handlers.compliance.security.ts    createComplianceSecurityHandlers()
 *   - handlers.compliance.erm.ts         createComplianceErmHandlers()
 *   - handlers.compliance.ts             createComplianceHandlers() (barrel)
 *
 * Strategy: use MSW setupServer (node) to spin up a lightweight server for
 * each module, then fetch the endpoints and assert on response shape.  A
 * structural check (handler count, path presence) guards against accidental
 * deletions; an integration check (actual HTTP responses) guards against
 * handler body regressions.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { setupServer } from 'msw/node'

import { createComplianceFrameworkHandlers } from '../handlers.compliance.frameworks'
import { createComplianceGovHandlers } from '../handlers.compliance.gov'
import { createComplianceSecurityHandlers } from '../handlers.compliance.security'
import { createComplianceErmHandlers } from '../handlers.compliance.erm'
import { createComplianceHandlers } from '../handlers.compliance'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Collect the path strings registered in an array of MSW v2 handlers. */
function handlerPaths(handlers: ReturnType<typeof createComplianceFrameworkHandlers>): string[] {
  return handlers.map((h) => {
    // MSW v2 exposes handler.info.path — fall back gracefully if the shape ever changes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const info = (h as any).info ?? {}
    return typeof info.path === 'string' ? info.path : String(info.path ?? '')
  })
}

// ---------------------------------------------------------------------------
// handlers.compliance.frameworks
// ---------------------------------------------------------------------------
describe('createComplianceFrameworkHandlers', () => {
  const server = setupServer(...createComplianceFrameworkHandlers())

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('registers 27 MSW handlers', () => {
    expect(createComplianceFrameworkHandlers()).toHaveLength(27)
  })

  it('covers /api/compliance/frameworks/ path', () => {
    const paths = handlerPaths(createComplianceFrameworkHandlers())
    expect(paths).toContain('/api/compliance/frameworks/')
  })

  it('GET /api/compliance/frameworks/ returns an array of frameworks', async () => {
    const res = await fetch('http://localhost/api/compliance/frameworks/')
    expect(res.ok).toBe(true)
    const data = await res.json() as unknown[]
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
    const first = data[0] as Record<string, unknown>
    expect(first).toHaveProperty('id')
    expect(first).toHaveProperty('name')
    expect(first).toHaveProperty('controls')
  })

  it('POST /api/compliance/frameworks/:id/evaluate returns a score', async () => {
    const res = await fetch('http://localhost/api/compliance/frameworks/pci-dss-4.0/evaluate', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.ok).toBe(true)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('framework_id', 'pci-dss-4.0')
    expect(data).toHaveProperty('score')
    expect(typeof data.score).toBe('number')
  })

  it('GET /api/compliance/hipaa/safeguards returns an array', async () => {
    const res = await fetch('http://localhost/api/compliance/hipaa/safeguards')
    expect(res.ok).toBe(true)
    const data = await res.json() as unknown[]
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('GET /api/compliance/hipaa/summary returns summary fields', async () => {
    const res = await fetch('http://localhost/api/compliance/hipaa/summary')
    expect(res.ok).toBe(true)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('score')
    expect(data).toHaveProperty('total_checks')
  })

  it('GET /api/compliance/baa/agreements returns an array', async () => {
    const res = await fetch('http://localhost/api/compliance/baa/agreements')
    expect(res.ok).toBe(true)
    const data = await res.json() as unknown[]
    expect(Array.isArray(data)).toBe(true)
  })

  it('GET /api/compliance/sod/summary returns sod_score', async () => {
    const res = await fetch('http://localhost/api/compliance/sod/summary')
    expect(res.ok).toBe(true)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('sod_score')
  })

  it('GET /api/compliance/change-control/summary returns change count', async () => {
    const res = await fetch('http://localhost/api/compliance/change-control/summary')
    expect(res.ok).toBe(true)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('total_changes')
  })

  it('GET /api/compliance/residency/summary returns compliant_clusters', async () => {
    const res = await fetch('http://localhost/api/compliance/residency/summary')
    expect(res.ok).toBe(true)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('compliant_clusters')
  })
})

// ---------------------------------------------------------------------------
// handlers.compliance.gov
// ---------------------------------------------------------------------------
describe('createComplianceGovHandlers', () => {
  const server = setupServer(...createComplianceGovHandlers())

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('registers 21 MSW handlers', () => {
    expect(createComplianceGovHandlers()).toHaveLength(21)
  })

  it('covers /api/compliance/nist/families path', () => {
    const paths = handlerPaths(createComplianceGovHandlers())
    expect(paths).toContain('/api/compliance/nist/families')
  })

  it('GET /api/compliance/nist/families returns families array', async () => {
    const res = await fetch('http://localhost/api/compliance/nist/families')
    expect(res.ok).toBe(true)
    const data = await res.json() as unknown[]
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
    const first = data[0] as Record<string, unknown>
    expect(first).toHaveProperty('id')
    expect(first).toHaveProperty('name')
  })

  it('GET /api/compliance/nist/summary returns score', async () => {
    const res = await fetch('http://localhost/api/compliance/nist/summary')
    expect(res.ok).toBe(true)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('score')
  })

  it('GET /api/compliance/stig/benchmarks returns an array', async () => {
    const res = await fetch('http://localhost/api/compliance/stig/benchmarks')
    expect(res.ok).toBe(true)
    const data = await res.json() as unknown[]
    expect(Array.isArray(data)).toBe(true)
  })

  it('GET /api/compliance/airgap/requirements returns an array', async () => {
    const res = await fetch('http://localhost/api/compliance/airgap/requirements')
    expect(res.ok).toBe(true)
    const data = await res.json() as unknown[]
    expect(Array.isArray(data)).toBe(true)
  })

  it('GET /api/compliance/fedramp/score returns score_percentage', async () => {
    const res = await fetch('http://localhost/api/compliance/fedramp/score')
    expect(res.ok).toBe(true)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('score_percentage')
  })

  it('GET /api/identity/oidc/summary returns providers_configured', async () => {
    const res = await fetch('http://localhost/api/identity/oidc/summary')
    expect(res.ok).toBe(true)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('providers_configured')
  })

  it('GET /api/identity/rbac/summary returns total_subjects', async () => {
    const res = await fetch('http://localhost/api/identity/rbac/summary')
    expect(res.ok).toBe(true)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('total_subjects')
  })
})

// ---------------------------------------------------------------------------
// handlers.compliance.security
// ---------------------------------------------------------------------------
describe('createComplianceSecurityHandlers', () => {
  const server = setupServer(...createComplianceSecurityHandlers())

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('registers 18 MSW handlers', () => {
    expect(createComplianceSecurityHandlers()).toHaveLength(18)
  })

  it('covers /api/v1/compliance/siem/events path', () => {
    const paths = handlerPaths(createComplianceSecurityHandlers())
    expect(paths).toContain('/api/v1/compliance/siem/events')
  })

  it('GET /api/v1/compliance/siem/events returns an array', async () => {
    const res = await fetch('http://localhost/api/v1/compliance/siem/events')
    expect(res.ok).toBe(true)
    const data = await res.json() as unknown[]
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('GET /api/v1/compliance/siem/summary returns total_events', async () => {
    const res = await fetch('http://localhost/api/v1/compliance/siem/summary')
    expect(res.ok).toBe(true)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('total_events')
  })

  it('GET /api/v1/compliance/incidents returns an array', async () => {
    const res = await fetch('http://localhost/api/v1/compliance/incidents')
    expect(res.ok).toBe(true)
    const data = await res.json() as unknown[]
    expect(Array.isArray(data)).toBe(true)
  })

  it('GET /api/v1/compliance/threat-intel/feeds returns an array', async () => {
    const res = await fetch('http://localhost/api/v1/compliance/threat-intel/feeds')
    expect(res.ok).toBe(true)
    const data = await res.json() as unknown[]
    expect(Array.isArray(data)).toBe(true)
  })

  it('GET /api/v1/compliance/sbom/summary returns total_packages', async () => {
    const res = await fetch('http://localhost/api/v1/compliance/sbom/summary')
    expect(res.ok).toBe(true)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('total_packages')
  })

  it('GET /api/v1/compliance/slsa/summary returns level', async () => {
    const res = await fetch('http://localhost/api/v1/compliance/slsa/summary')
    expect(res.ok).toBe(true)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('level')
  })
})

// ---------------------------------------------------------------------------
// handlers.compliance.erm
// ---------------------------------------------------------------------------
describe('createComplianceErmHandlers', () => {
  const server = setupServer(...createComplianceErmHandlers())

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('registers 12 MSW handlers', () => {
    expect(createComplianceErmHandlers()).toHaveLength(12)
  })

  it('covers /api/v1/compliance/erm/risk-matrix/risks path', () => {
    const paths = handlerPaths(createComplianceErmHandlers())
    expect(paths).toContain('/api/v1/compliance/erm/risk-matrix/risks')
  })

  it('GET /api/v1/compliance/erm/risk-matrix/risks returns an array with id/name', async () => {
    const res = await fetch('http://localhost/api/v1/compliance/erm/risk-matrix/risks')
    expect(res.ok).toBe(true)
    const data = await res.json() as unknown[]
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
    const first = data[0] as Record<string, unknown>
    expect(first).toHaveProperty('id')
    expect(first).toHaveProperty('name')
    expect(first).toHaveProperty('score')
  })

  it('GET /api/v1/compliance/erm/risk-matrix/summary returns total_risks', async () => {
    const res = await fetch('http://localhost/api/v1/compliance/erm/risk-matrix/summary')
    expect(res.ok).toBe(true)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('total_risks')
  })

  it('GET /api/v1/compliance/erm/risk-register/risks returns an array', async () => {
    const res = await fetch('http://localhost/api/v1/compliance/erm/risk-register/risks')
    expect(res.ok).toBe(true)
    const data = await res.json() as unknown[]
    expect(Array.isArray(data)).toBe(true)
  })

  it('GET /api/v1/compliance/erm/risk-appetite/thresholds returns an array', async () => {
    const res = await fetch('http://localhost/api/v1/compliance/erm/risk-appetite/thresholds')
    expect(res.ok).toBe(true)
    const data = await res.json() as unknown[]
    expect(Array.isArray(data)).toBe(true)
  })

  it('GET /api/cards/templates returns templates object', async () => {
    const res = await fetch('http://localhost/api/cards/templates')
    expect(res.ok).toBe(true)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('templates')
    expect(Array.isArray(data.templates)).toBe(true)
    const templates = data.templates as Record<string, unknown>[]
    expect(templates.length).toBeGreaterThan(0)
    expect(templates[0]).toHaveProperty('id')
    expect(templates[0]).toHaveProperty('name')
  })

  it('POST /api/cards/save returns shareId', async () => {
    const res = await fetch('http://localhost/api/cards/save', {
      method: 'POST',
      body: JSON.stringify({ id: 'test-card', config: { foo: 'bar' } }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.ok).toBe(true)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('success', true)
    expect(data).toHaveProperty('shareId')
    expect(typeof data.shareId).toBe('string')
  })

  it('GET /api/cards/shared/:shareId returns 404 for unknown id', async () => {
    const res = await fetch('http://localhost/api/cards/shared/nonexistent-id-xyz')
    expect(res.status).toBe(404)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error', 'Card not found')
  })

  it('GET /api/cards/shared/:shareId returns saved card after POST', async () => {
    // Save a card first
    const saveRes = await fetch('http://localhost/api/cards/save', {
      method: 'POST',
      body: JSON.stringify({ id: 'shared-test', config: { widget: 'cluster_health' } }),
      headers: { 'Content-Type': 'application/json' },
    })
    const saveData = await saveRes.json() as { shareId: string }
    const shareId = saveData.shareId

    // Retrieve it
    const getRes = await fetch(`http://localhost/api/cards/shared/${shareId}`)
    expect(getRes.ok).toBe(true)
    const getData = await getRes.json() as Record<string, unknown>
    expect(getData).toHaveProperty('card')
    const card = getData.card as Record<string, unknown>
    expect(card).toHaveProperty('id', 'shared-test')
  })
})

// ---------------------------------------------------------------------------
// handlers.compliance (barrel)
// ---------------------------------------------------------------------------
describe('createComplianceHandlers (barrel)', () => {
  it('returns the combined handler count from all sub-modules', () => {
    const all = createComplianceHandlers()
    const expected =
      createComplianceFrameworkHandlers().length +
      createComplianceGovHandlers().length +
      createComplianceSecurityHandlers().length +
      createComplianceErmHandlers().length
    expect(all).toHaveLength(expected)
  })

  it('covers all sub-module paths', () => {
    const allPaths = handlerPaths(createComplianceHandlers())
    expect(allPaths).toContain('/api/compliance/frameworks/')
    expect(allPaths).toContain('/api/compliance/nist/families')
    expect(allPaths).toContain('/api/v1/compliance/siem/events')
    expect(allPaths).toContain('/api/v1/compliance/erm/risk-matrix/risks')
  })

  it('returns an array of MSW handler objects', () => {
    const handlers = createComplianceHandlers()
    expect(Array.isArray(handlers)).toBe(true)
    for (const h of handlers) {
      expect(h).toBeDefined()
      expect(typeof h).toBe('object')
    }
  })
})
