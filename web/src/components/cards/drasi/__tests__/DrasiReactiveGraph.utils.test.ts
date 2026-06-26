import { describe, it, expect } from 'vitest'
import {
  buildStreamEndpoint,
  buildDrasiProxyTarget,
  getDrasiResourcePath,
} from '../DrasiReactiveGraph.utils'
import { DEMO_STREAM_ENDPOINT } from '../DrasiConstants'
import type { DrasiConnection } from '../../../../hooks/useDrasiConnections'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const serverConn: DrasiConnection = {
  id: 'conn-1',
  name: 'Test Server',
  mode: 'server',
  url: 'https://drasi.example.com',
  createdAt: 0,
}

const platformConn: DrasiConnection = {
  id: 'conn-2',
  name: 'Test Platform',
  mode: 'platform',
  cluster: 'my-cluster',
  createdAt: 0,
}

const demoConn: DrasiConnection = {
  id: 'demo-seed',
  name: 'Demo',
  mode: 'server',
  url: 'https://drasi.demo.example.com',
  isDemoSeed: true,
  createdAt: 0,
}

const serverLiveData = { mode: 'server' as const, instanceId: 'inst-abc' }
const platformLiveData = { mode: 'platform' as const, instanceId: null }

// ---------------------------------------------------------------------------
// buildStreamEndpoint
// ---------------------------------------------------------------------------

describe('buildStreamEndpoint', () => {
  it('returns DEMO_STREAM_ENDPOINT when connection is null', () => {
    expect(buildStreamEndpoint(null, serverLiveData, 'q1')).toBe(DEMO_STREAM_ENDPOINT)
  })

  it('returns DEMO_STREAM_ENDPOINT when liveData is null', () => {
    expect(buildStreamEndpoint(serverConn, null, 'q1')).toBe(DEMO_STREAM_ENDPOINT)
  })

  it('returns DEMO_STREAM_ENDPOINT for a demo seed connection', () => {
    expect(buildStreamEndpoint(demoConn, serverLiveData, 'q1')).toBe(DEMO_STREAM_ENDPOINT)
  })

  it('builds server endpoint with instanceId and queryId', () => {
    const result = buildStreamEndpoint(serverConn, serverLiveData, 'my-query')
    expect(result).toBe(
      'https://drasi.example.com/api/v1/instances/inst-abc/queries/my-query/events/stream',
    )
  })

  it('URL-encodes special characters in queryId', () => {
    const result = buildStreamEndpoint(serverConn, serverLiveData, 'q id/with spaces')
    expect(result).toContain(encodeURIComponent('q id/with spaces'))
  })

  it('strips trailing slashes from server url', () => {
    const conn = { ...serverConn, url: 'https://drasi.example.com///' }
    const result = buildStreamEndpoint(conn, serverLiveData, 'q1')
    expect(result).not.toMatch(/\/\/\/api/)
    expect(result).toContain('/api/v1/instances')
  })

  it('falls back to platform placeholder when mode is server but instanceId is null', () => {
    const noInstance = { mode: 'server' as const, instanceId: null }
    const result = buildStreamEndpoint(serverConn, noInstance, 'q1')
    expect(result).toContain('your-result-reaction')
  })

  it('returns platform placeholder endpoint for platform mode', () => {
    const result = buildStreamEndpoint(platformConn, platformLiveData, 'q1')
    expect(result).toContain('drasi-system.svc')
    expect(result).toContain(encodeURIComponent('q1'))
  })
})

// ---------------------------------------------------------------------------
// buildDrasiProxyTarget
// ---------------------------------------------------------------------------

describe('buildDrasiProxyTarget', () => {
  it('returns empty string when connection is null', () => {
    expect(buildDrasiProxyTarget(null)).toBe('')
  })

  it('builds server target with encoded url', () => {
    const result = buildDrasiProxyTarget(serverConn)
    expect(result).toBe(`target=server&url=${encodeURIComponent('https://drasi.example.com')}`)
  })

  it('builds platform target with encoded cluster', () => {
    const result = buildDrasiProxyTarget(platformConn)
    expect(result).toBe(`target=platform&cluster=${encodeURIComponent('my-cluster')}`)
  })

  it('uses empty cluster string when cluster is undefined', () => {
    const conn = { ...platformConn, cluster: undefined }
    const result = buildDrasiProxyTarget(conn)
    expect(result).toBe('target=platform&cluster=')
  })

  it('builds server target correctly even in mode=server with no url (falls through to platform branch)', () => {
    const noUrl = { ...serverConn, url: undefined }
    const result = buildDrasiProxyTarget(noUrl)
    expect(result).toContain('target=platform')
  })
})

// ---------------------------------------------------------------------------
// getDrasiResourcePath
// ---------------------------------------------------------------------------

describe('getDrasiResourcePath', () => {
  it('returns empty string when mode is null', () => {
    expect(getDrasiResourcePath(null, 'source')).toBe('')
  })

  it('returns empty string when mode is undefined', () => {
    expect(getDrasiResourcePath(undefined, 'query')).toBe('')
  })

  describe('server mode', () => {
    it('returns /api/v1/sources for source', () => {
      expect(getDrasiResourcePath('server', 'source')).toBe('/api/v1/sources')
    })

    it('returns /api/v1/queries for query', () => {
      expect(getDrasiResourcePath('server', 'query')).toBe('/api/v1/queries')
    })

    it('returns /api/v1/reactions for reaction', () => {
      expect(getDrasiResourcePath('server', 'reaction')).toBe('/api/v1/reactions')
    })
  })

  describe('platform mode', () => {
    it('returns /v1/sources for source', () => {
      expect(getDrasiResourcePath('platform', 'source')).toBe('/v1/sources')
    })

    it('returns /v1/continuousQueries for query', () => {
      expect(getDrasiResourcePath('platform', 'query')).toBe('/v1/continuousQueries')
    })

    it('returns /v1/reactions for reaction', () => {
      expect(getDrasiResourcePath('platform', 'reaction')).toBe('/v1/reactions')
    })
  })
})
