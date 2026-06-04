// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  makeIdentityRequest,
  readJson,
  assertNoForbiddenIdentityFields,
} from './netlify-handler-helpers'

// Import all compliance dashboard functions
import complianceSiemEvents from '../compliance-siem-events.mts'
import complianceSiemAlerts from '../compliance-siem-alerts.mts'
import complianceSiemSummary from '../compliance-siem-summary.mts'
import complianceIncidents from '../compliance-incidents.mts'
import complianceIncidentsMetrics from '../compliance-incidents-metrics.mts'
import complianceIncidentsPlaybooks from '../compliance-incidents-playbooks.mts'
import complianceThreatIntelFeeds from '../compliance-threat-intel-feeds.mts'
import complianceThreatIntelIocs from '../compliance-threat-intel-iocs.mts'
import complianceThreatIntelSummary from '../compliance-threat-intel-summary.mts'
import complianceErmRiskMatrixRisks from '../compliance-erm-risk-matrix-risks.mts'
import complianceErmRiskMatrixHeatmap from '../compliance-erm-risk-matrix-heatmap.mts'
import complianceErmRiskMatrixSummary from '../compliance-erm-risk-matrix-summary.mts'
import complianceErmRiskRegisterRisks from '../compliance-erm-risk-register-risks.mts'
import complianceErmRiskRegisterCategories from '../compliance-erm-risk-register-categories.mts'
import complianceErmRiskRegisterSummary from '../compliance-erm-risk-register-summary.mts'
import complianceErmRiskAppetiteThresholds from '../compliance-erm-risk-appetite-thresholds.mts'
import complianceErmRiskAppetiteKris from '../compliance-erm-risk-appetite-kris.mts'
import complianceErmRiskAppetiteSummary from '../compliance-erm-risk-appetite-summary.mts'
import supplyChainSbomDocuments from '../supply-chain-sbom-documents.mts'
import supplyChainSbomSummary from '../supply-chain-sbom-summary.mts'
import supplyChainLicensesPackages from '../supply-chain-licenses-packages.mts'
import supplyChainLicensesCategories from '../supply-chain-licenses-categories.mts'
import supplyChainLicensesSummary from '../supply-chain-licenses-summary.mts'

type HandlerFn = (req: Request) => Promise<Response>

const INVALID_CLUSTER_SEARCH = 'cluster=not valid!!!'

// Reusable test suites for common scenarios
function runBadInputSuite(name: string, handler: HandlerFn, path: string) {
  describe(`${name} — bad input`, () => {
    it('returns 400 for invalid cluster query parameter', async () => {
      const res = await handler(makeIdentityRequest(path, { search: INVALID_CLUSTER_SEARCH }))
      expect(res.status).toBe(400)
      const body = await readJson<{ error: string }>(res)
      expect(body.error).toContain('Invalid cluster')
    })

    it('returns 405 for POST with Allow header', async () => {
      const res = await handler(makeIdentityRequest(path, { method: 'POST' }))
      expect(res.status).toBe(405)
      expect(res.headers.get('Allow')).toBe('GET, OPTIONS')
      const body = await readJson<{ error: string }>(res)
      expect(body.error).toContain('Method not allowed')
    })
  })
}

describe('wrapIdentityDemoResponse — CORS preflight', () => {
  it('returns 204 OPTIONS with Access-Control-Allow-Methods and Allow-Headers', async () => {
    const res = await complianceSiemSummary(
      makeIdentityRequest('/api/compliance/siem/summary', { method: 'OPTIONS' }),
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://console.kubestellar.io',
    )
  })
})

function runUpstreamErrorSuite(name: string, handler: HandlerFn, path: string) {
  describe(`${name} — upstream/serialization error`, () => {
    let stringifySpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      stringifySpy = vi.spyOn(JSON, 'stringify').mockImplementation(() => {
        throw new Error('serialization failed')
      })
    })

    afterEach(() => {
      stringifySpy.mockRestore()
    })

    it('returns 502 when response JSON serialization fails', async () => {
      const res = await handler(makeIdentityRequest(path))
      expect(res.status).toBe(502)
      const raw = await res.text()
      expect(raw).toContain('unavailable')
      assertNoForbiddenIdentityFields(raw)
    })
  })
}

// SIEM Dashboard Tests
describe('compliance-siem-summary', () => {
  const API_PATH = '/api/compliance/siem/summary'

  it('returns summary statistics', async () => {
    const res = await complianceSiemSummary(makeIdentityRequest(API_PATH))
    expect(res.status).toBe(200)
    const data = await readJson<{
      total_events: number
      critical_alerts: number
      high_alerts: number
    }>(res)

    expect(typeof data.total_events).toBe('number')
    expect(typeof data.critical_alerts).toBe('number')
    expect(typeof data.high_alerts).toBe('number')
    assertNoForbiddenIdentityFields(JSON.stringify(data))
  })

  runBadInputSuite('compliance-siem-summary', complianceSiemSummary, API_PATH)
  runUpstreamErrorSuite('compliance-siem-summary', complianceSiemSummary, API_PATH)
})

describe('compliance-siem-events', () => {
  const API_PATH = '/api/compliance/siem/events'

  it('returns array of SIEM events', async () => {
    const res = await complianceSiemEvents(makeIdentityRequest(API_PATH))
    expect(res.status).toBe(200)
    const data = await readJson<Array<{ id: string; timestamp: string }>>(res)

    expect(Array.isArray(data)).toBe(true)
    if (data.length > 0) {
      expect(typeof data[0].id).toBe('string')
      expect(typeof data[0].timestamp).toBe('string')
    }
    assertNoForbiddenIdentityFields(JSON.stringify(data))
  })

  runBadInputSuite('compliance-siem-events', complianceSiemEvents, API_PATH)
  runUpstreamErrorSuite('compliance-siem-events', complianceSiemEvents, API_PATH)
})

describe('compliance-siem-alerts', () => {
  const API_PATH = '/api/compliance/siem/alerts'

  it('returns array of SIEM alerts', async () => {
    const res = await complianceSiemAlerts(makeIdentityRequest(API_PATH))
    expect(res.status).toBe(200)
    const data = await readJson<Array<{ id: string; severity: string }>>(res)

    expect(Array.isArray(data)).toBe(true)
    if (data.length > 0) {
      expect(typeof data[0].id).toBe('string')
      expect(typeof data[0].severity).toBe('string')
    }
    assertNoForbiddenIdentityFields(JSON.stringify(data))
  })

  runBadInputSuite('compliance-siem-alerts', complianceSiemAlerts, API_PATH)
  runUpstreamErrorSuite('compliance-siem-alerts', complianceSiemAlerts, API_PATH)
})

// Incident Response Dashboard Tests
describe('compliance-incidents-metrics', () => {
  const API_PATH = '/api/compliance/incidents/metrics'

  it('returns incident metrics', async () => {
    const res = await complianceIncidentsMetrics(makeIdentityRequest(API_PATH))
    expect(res.status).toBe(200)
    const data = await readJson<{
      total_incidents: number
      active_incidents: number
    }>(res)

    expect(typeof data.total_incidents).toBe('number')
    expect(typeof data.active_incidents).toBe('number')
    assertNoForbiddenIdentityFields(JSON.stringify(data))
  })

  runBadInputSuite('compliance-incidents-metrics', complianceIncidentsMetrics, API_PATH)
  runUpstreamErrorSuite('compliance-incidents-metrics', complianceIncidentsMetrics, API_PATH)
})

describe('compliance-incidents', () => {
  const API_PATH = '/api/compliance/incidents'

  it('returns array of incidents', async () => {
    const res = await complianceIncidents(makeIdentityRequest(API_PATH))
    expect(res.status).toBe(200)
    const data = await readJson<Array<{ id: string; status: string }>>(res)

    expect(Array.isArray(data)).toBe(true)
    if (data.length > 0) {
      expect(typeof data[0].id).toBe('string')
      expect(typeof data[0].status).toBe('string')
    }
    assertNoForbiddenIdentityFields(JSON.stringify(data))
  })

  runBadInputSuite('compliance-incidents', complianceIncidents, API_PATH)
  runUpstreamErrorSuite('compliance-incidents', complianceIncidents, API_PATH)
})

describe('compliance-incidents-playbooks', () => {
  const API_PATH = '/api/compliance/incidents/playbooks'

  it('returns array of incident playbooks', async () => {
    const res = await complianceIncidentsPlaybooks(makeIdentityRequest(API_PATH))
    expect(res.status).toBe(200)
    const data = await readJson<Array<{ id: string; name: string }>>(res)

    expect(Array.isArray(data)).toBe(true)
    if (data.length > 0) {
      expect(typeof data[0].id).toBe('string')
      expect(typeof data[0].name).toBe('string')
    }
    assertNoForbiddenIdentityFields(JSON.stringify(data))
  })

  runBadInputSuite('compliance-incidents-playbooks', complianceIncidentsPlaybooks, API_PATH)
  runUpstreamErrorSuite('compliance-incidents-playbooks', complianceIncidentsPlaybooks, API_PATH)
})

// Threat Intelligence Dashboard Tests
describe('compliance-threat-intel-summary', () => {
  const API_PATH = '/api/compliance/threat-intel/summary'

  it('returns threat intel summary', async () => {
    const res = await complianceThreatIntelSummary(makeIdentityRequest(API_PATH))
    expect(res.status).toBe(200)
    const data = await readJson<{
      total_feeds: number
      total_indicators: number
    }>(res)

    expect(typeof data.total_feeds).toBe('number')
    expect(typeof data.total_indicators).toBe('number')
    assertNoForbiddenIdentityFields(JSON.stringify(data))
  })

  runBadInputSuite('compliance-threat-intel-summary', complianceThreatIntelSummary, API_PATH)
  runUpstreamErrorSuite('compliance-threat-intel-summary', complianceThreatIntelSummary, API_PATH)
})

describe('compliance-threat-intel-feeds', () => {
  const API_PATH = '/api/compliance/threat-intel/feeds'

  it('returns array of threat intel feeds', async () => {
    const res = await complianceThreatIntelFeeds(makeIdentityRequest(API_PATH))
    expect(res.status).toBe(200)
    const data = await readJson<Array<{ id: string; name: string }>>(res)

    expect(Array.isArray(data)).toBe(true)
    if (data.length > 0) {
      expect(typeof data[0].id).toBe('string')
      expect(typeof data[0].name).toBe('string')
    }
    assertNoForbiddenIdentityFields(JSON.stringify(data))
  })

  runBadInputSuite('compliance-threat-intel-feeds', complianceThreatIntelFeeds, API_PATH)
  runUpstreamErrorSuite('compliance-threat-intel-feeds', complianceThreatIntelFeeds, API_PATH)
})

describe('compliance-threat-intel-iocs', () => {
  const API_PATH = '/api/compliance/threat-intel/iocs'

  it('returns array of IOCs', async () => {
    const res = await complianceThreatIntelIocs(makeIdentityRequest(API_PATH))
    expect(res.status).toBe(200)
    const data = await readJson<Array<{ id: string; ioc_type: string }>>(res)

    expect(Array.isArray(data)).toBe(true)
    if (data.length > 0) {
      expect(typeof data[0].id).toBe('string')
      expect(typeof data[0].ioc_type).toBe('string')
    }
    assertNoForbiddenIdentityFields(JSON.stringify(data))
  })

  runBadInputSuite('compliance-threat-intel-iocs', complianceThreatIntelIocs, API_PATH)
  runUpstreamErrorSuite('compliance-threat-intel-iocs', complianceThreatIntelIocs, API_PATH)
})

// ERM Risk Matrix Dashboard Tests
describe('compliance-erm-risk-matrix-summary', () => {
  const API_PATH = '/api/compliance/erm/risk-matrix/summary'

  it('returns risk matrix summary', async () => {
    const res = await complianceErmRiskMatrixSummary(makeIdentityRequest(API_PATH))
    expect(res.status).toBe(200)
    const data = await readJson<{
      total_risks: number
      critical: number
    }>(res)

    expect(typeof data.total_risks).toBe('number')
    expect(typeof data.critical).toBe('number')
    assertNoForbiddenIdentityFields(JSON.stringify(data))
  })

  runBadInputSuite('compliance-erm-risk-matrix-summary', complianceErmRiskMatrixSummary, API_PATH)
  runUpstreamErrorSuite('compliance-erm-risk-matrix-summary', complianceErmRiskMatrixSummary, API_PATH)
})

describe('compliance-erm-risk-matrix-risks', () => {
  const API_PATH = '/api/compliance/erm/risk-matrix/risks'

  it('returns array of risks', async () => {
    const res = await complianceErmRiskMatrixRisks(makeIdentityRequest(API_PATH))
    expect(res.status).toBe(200)
    const data = await readJson<Array<{ id: string; name: string }>>(res)

    expect(Array.isArray(data)).toBe(true)
    if (data.length > 0) {
      expect(typeof data[0].id).toBe('string')
      expect(typeof data[0].name).toBe('string')
    }
    assertNoForbiddenIdentityFields(JSON.stringify(data))
  })

  runBadInputSuite('compliance-erm-risk-matrix-risks', complianceErmRiskMatrixRisks, API_PATH)
  runUpstreamErrorSuite('compliance-erm-risk-matrix-risks', complianceErmRiskMatrixRisks, API_PATH)
})

describe('compliance-erm-risk-matrix-heatmap', () => {
  const API_PATH = '/api/compliance/erm/risk-matrix/heatmap'

  it('returns risk heatmap data', async () => {
    const res = await complianceErmRiskMatrixHeatmap(makeIdentityRequest(API_PATH))
    expect(res.status).toBe(200)
    const data = await readJson<Array<{ likelihood: number; impact: number }>>(res)

    expect(Array.isArray(data)).toBe(true)
    if (data.length > 0) {
      expect(typeof data[0].likelihood).toBe('number')
      expect(typeof data[0].impact).toBe('number')
    }
    assertNoForbiddenIdentityFields(JSON.stringify(data))
  })

  runBadInputSuite('compliance-erm-risk-matrix-heatmap', complianceErmRiskMatrixHeatmap, API_PATH)
  runUpstreamErrorSuite('compliance-erm-risk-matrix-heatmap', complianceErmRiskMatrixHeatmap, API_PATH)
})

// ERM Risk Register Dashboard Tests
describe('compliance-erm-risk-register-summary', () => {
  const API_PATH = '/api/compliance/erm/risk-register/summary'

  it('returns risk register summary', async () => {
    const res = await complianceErmRiskRegisterSummary(makeIdentityRequest(API_PATH))
    expect(res.status).toBe(200)
    const data = await readJson<{
      total_risks: number
      open_risks: number
    }>(res)

    expect(typeof data.total_risks).toBe('number')
    expect(typeof data.open_risks).toBe('number')
    assertNoForbiddenIdentityFields(JSON.stringify(data))
  })

  runBadInputSuite('compliance-erm-risk-register-summary', complianceErmRiskRegisterSummary, API_PATH)
  runUpstreamErrorSuite('compliance-erm-risk-register-summary', complianceErmRiskRegisterSummary, API_PATH)
})

describe('compliance-erm-risk-register-risks', () => {
  const API_PATH = '/api/compliance/erm/risk-register/risks'

  it('returns array of registered risks', async () => {
    const res = await complianceErmRiskRegisterRisks(makeIdentityRequest(API_PATH))
    expect(res.status).toBe(200)
    const data = await readJson<Array<{ id: string; status: string }>>(res)

    expect(Array.isArray(data)).toBe(true)
    if (data.length > 0) {
      expect(typeof data[0].id).toBe('string')
      expect(typeof data[0].status).toBe('string')
    }
    assertNoForbiddenIdentityFields(JSON.stringify(data))
  })

  runBadInputSuite('compliance-erm-risk-register-risks', complianceErmRiskRegisterRisks, API_PATH)
  runUpstreamErrorSuite('compliance-erm-risk-register-risks', complianceErmRiskRegisterRisks, API_PATH)
})

describe('compliance-erm-risk-register-categories', () => {
  const API_PATH = '/api/compliance/erm/risk-register/categories'

  it('returns array of risk categories', async () => {
    const res = await complianceErmRiskRegisterCategories(makeIdentityRequest(API_PATH))
    expect(res.status).toBe(200)
    const data = await readJson<Array<{ category: string; count: number }>>(res)

    expect(Array.isArray(data)).toBe(true)
    if (data.length > 0) {
      expect(typeof data[0].category).toBe('string')
      expect(typeof data[0].count).toBe('number')
    }
    assertNoForbiddenIdentityFields(JSON.stringify(data))
  })

  runBadInputSuite('compliance-erm-risk-register-categories', complianceErmRiskRegisterCategories, API_PATH)
  runUpstreamErrorSuite('compliance-erm-risk-register-categories', complianceErmRiskRegisterCategories, API_PATH)
})

// ERM Risk Appetite Dashboard Tests
describe('compliance-erm-risk-appetite-summary', () => {
  const API_PATH = '/api/compliance/erm/risk-appetite/summary'

  it('returns risk appetite summary', async () => {
    const res = await complianceErmRiskAppetiteSummary(makeIdentityRequest(API_PATH))
    expect(res.status).toBe(200)
    const data = await readJson<{
      total_categories: number
      breaches: number
    }>(res)

    expect(typeof data.total_categories).toBe('number')
    expect(typeof data.breaches).toBe('number')
    assertNoForbiddenIdentityFields(JSON.stringify(data))
  })

  runBadInputSuite('compliance-erm-risk-appetite-summary', complianceErmRiskAppetiteSummary, API_PATH)
  runUpstreamErrorSuite('compliance-erm-risk-appetite-summary', complianceErmRiskAppetiteSummary, API_PATH)
})

describe('compliance-erm-risk-appetite-thresholds', () => {
  const API_PATH = '/api/compliance/erm/risk-appetite/thresholds'

  it('returns array of risk thresholds', async () => {
    const res = await complianceErmRiskAppetiteThresholds(makeIdentityRequest(API_PATH))
    expect(res.status).toBe(200)
    const data = await readJson<Array<{ category: string; appetite_level: number }>>(res)

    expect(Array.isArray(data)).toBe(true)
    if (data.length > 0) {
      expect(typeof data[0].category).toBe('string')
      expect(typeof data[0].appetite_level).toBe('number')
    }
    assertNoForbiddenIdentityFields(JSON.stringify(data))
  })

  runBadInputSuite('compliance-erm-risk-appetite-thresholds', complianceErmRiskAppetiteThresholds, API_PATH)
  runUpstreamErrorSuite('compliance-erm-risk-appetite-thresholds', complianceErmRiskAppetiteThresholds, API_PATH)
})

describe('compliance-erm-risk-appetite-kris', () => {
  const API_PATH = '/api/compliance/erm/risk-appetite/kris'

  it('returns array of KRIs (Key Risk Indicators)', async () => {
    const res = await complianceErmRiskAppetiteKris(makeIdentityRequest(API_PATH))
    expect(res.status).toBe(200)
    const data = await readJson<Array<{ id: string; name: string }>>(res)

    expect(Array.isArray(data)).toBe(true)
    if (data.length > 0) {
      expect(typeof data[0].id).toBe('string')
      expect(typeof data[0].name).toBe('string')
    }
    assertNoForbiddenIdentityFields(JSON.stringify(data))
  })

  runBadInputSuite('compliance-erm-risk-appetite-kris', complianceErmRiskAppetiteKris, API_PATH)
  runUpstreamErrorSuite('compliance-erm-risk-appetite-kris', complianceErmRiskAppetiteKris, API_PATH)
})

// Supply Chain SBOM Dashboard Tests
describe('supply-chain-sbom-summary', () => {
  const API_PATH = '/api/supply-chain/sbom/summary'

  it('returns SBOM summary', async () => {
    const res = await supplyChainSbomSummary(makeIdentityRequest(API_PATH))
    expect(res.status).toBe(200)
    const data = await readJson<{
      total_workloads: number
      total_components: number
    }>(res)

    expect(typeof data.total_workloads).toBe('number')
    expect(typeof data.total_components).toBe('number')
    assertNoForbiddenIdentityFields(JSON.stringify(data))
  })

  runBadInputSuite('supply-chain-sbom-summary', supplyChainSbomSummary, API_PATH)
  runUpstreamErrorSuite('supply-chain-sbom-summary', supplyChainSbomSummary, API_PATH)
})

describe('supply-chain-sbom-documents', () => {
  const API_PATH = '/api/supply-chain/sbom/documents'

  it('returns array of SBOM documents', async () => {
    const res = await supplyChainSbomDocuments(makeIdentityRequest(API_PATH))
    expect(res.status).toBe(200)
    const data = await readJson<Array<{ id: string; format: string }>>(res)

    expect(Array.isArray(data)).toBe(true)
    if (data.length > 0) {
      expect(typeof data[0].id).toBe('string')
      expect(typeof data[0].format).toBe('string')
    }
    assertNoForbiddenIdentityFields(JSON.stringify(data))
  })

  runBadInputSuite('supply-chain-sbom-documents', supplyChainSbomDocuments, API_PATH)
  runUpstreamErrorSuite('supply-chain-sbom-documents', supplyChainSbomDocuments, API_PATH)
})

// Supply Chain License Compliance Dashboard Tests
describe('supply-chain-licenses-summary', () => {
  const API_PATH = '/api/supply-chain/licenses/summary'

  it('returns license compliance summary', async () => {
    const res = await supplyChainLicensesSummary(makeIdentityRequest(API_PATH))
    expect(res.status).toBe(200)
    const data = await readJson<{
      total_packages: number
      allowed_packages: number
    }>(res)

    expect(typeof data.total_packages).toBe('number')
    expect(typeof data.allowed_packages).toBe('number')
    assertNoForbiddenIdentityFields(JSON.stringify(data))
  })

  runBadInputSuite('supply-chain-licenses-summary', supplyChainLicensesSummary, API_PATH)
  runUpstreamErrorSuite('supply-chain-licenses-summary', supplyChainLicensesSummary, API_PATH)
})

describe('supply-chain-licenses-packages', () => {
  const API_PATH = '/api/supply-chain/licenses/packages'

  it('returns array of licensed packages', async () => {
    const res = await supplyChainLicensesPackages(makeIdentityRequest(API_PATH))
    expect(res.status).toBe(200)
    const data = await readJson<Array<{ name: string; license: string }>>(res)

    expect(Array.isArray(data)).toBe(true)
    if (data.length > 0) {
      expect(typeof data[0].name).toBe('string')
      expect(typeof data[0].license).toBe('string')
    }
    assertNoForbiddenIdentityFields(JSON.stringify(data))
  })

  runBadInputSuite('supply-chain-licenses-packages', supplyChainLicensesPackages, API_PATH)
  runUpstreamErrorSuite('supply-chain-licenses-packages', supplyChainLicensesPackages, API_PATH)
})

describe('supply-chain-licenses-categories', () => {
  const API_PATH = '/api/supply-chain/licenses/categories'

  it('returns array of license categories', async () => {
    const res = await supplyChainLicensesCategories(makeIdentityRequest(API_PATH))
    expect(res.status).toBe(200)
    const data = await readJson<Array<{ name: string; count: number }>>(res)

    expect(Array.isArray(data)).toBe(true)
    if (data.length > 0) {
      expect(typeof data[0].name).toBe('string')
      expect(typeof data[0].count).toBe('number')
    }
    assertNoForbiddenIdentityFields(JSON.stringify(data))
  })

  runBadInputSuite('supply-chain-licenses-categories', supplyChainLicensesCategories, API_PATH)
  runUpstreamErrorSuite('supply-chain-licenses-categories', supplyChainLicensesCategories, API_PATH)
})
