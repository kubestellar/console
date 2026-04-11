import { describe, it, expect } from 'vitest'
import {
  generateCardWidget,
  generateStatWidget,
  generateTemplateWidget,
  generateWidget,
  getWidgetFilename,
} from '../codeGenerator'
import type { WidgetConfig } from '../codeGenerator'

describe('generateCardWidget', () => {
  it('generates valid widget code for cluster_health', () => {
    const code = generateCardWidget('cluster_health', 'http://localhost:8080')
    expect(code).toContain('Cluster Health Widget')
    expect(code).toContain('export const command')
    expect(code).toContain('export const refreshFrequency')
    expect(code).toContain('export const render')
    expect(code).toContain('curl')
  })

  it('generates valid widget code for pod_issues', () => {
    const code = generateCardWidget('pod_issues', 'http://localhost:8080')
    expect(code).toContain('Pod Issues Widget')
    expect(code).toContain('CrashLoopBackOff')
    expect(code).toContain('OOMKilled')
  })

  it('generates valid widget code for gpu_overview', () => {
    const code = generateCardWidget('gpu_overview', 'http://localhost:8080')
    expect(code).toContain('GPU Overview Widget')
    expect(code).toContain('Utilization')
    expect(code).toContain('Allocated')
  })

  it('generates valid widget code for nightly_e2e_status', () => {
    const code = generateCardWidget('nightly_e2e_status', 'http://localhost:8080')
    expect(code).toContain('Nightly E2E Status')
    expect(code).toContain('Pass Rate')
    expect(code).toContain('public/nightly-e2e')
  })

  it('uses custom refresh interval', () => {
    const CUSTOM_INTERVAL = 60000
    const code = generateCardWidget('cluster_health', 'http://localhost:8080', CUSTOM_INTERVAL)
    expect(code).toContain(`refreshFrequency = ${CUSTOM_INTERVAL}`)
  })

  it('uses default refresh interval of 30000', () => {
    const code = generateCardWidget('cluster_health', 'http://localhost:8080')
    expect(code).toContain('refreshFrequency = 30000')
  })

  it('throws for unknown card type', () => {
    expect(() => generateCardWidget('nonexistent_card', 'http://localhost:8080'))
      .toThrow('Unknown card type: nonexistent_card')
  })

  it('appends source=ubersicht-widget query param to curl URL', () => {
    const code = generateCardWidget('cluster_health', 'http://localhost:8080')
    expect(code).toContain('source=ubersicht-widget')
  })

  it('includes widget shell with drag support', () => {
    const code = generateCardWidget('cluster_health', 'http://localhost:8080')
    expect(code).toContain('handleDragStart')
    expect(code).toContain('STORAGE_KEY')
    expect(code).toContain('localStorage')
  })

  it('generates default render function for unknown card types in registry', () => {
    const code = generateCardWidget('workload_status', 'http://localhost:8080')
    expect(code).toContain('Workload Status Widget')
    expect(code).toContain('export const render')
  })
})

describe('generateStatWidget', () => {
  it('generates widget code for single stat', () => {
    const code = generateStatWidget(['total_clusters'], 'http://localhost:8080')
    expect(code).toContain('Stats Widget')
    expect(code).toContain('Clusters')
    expect(code).toContain('StatBlock')
  })

  it('generates widget code for multiple stats', () => {
    const code = generateStatWidget(
      ['total_clusters', 'total_pods', 'total_gpus'],
      'http://localhost:8080'
    )
    expect(code).toContain('Clusters')
    expect(code).toContain('Pods')
    expect(code).toContain('GPUs')
  })

  it('uses custom refresh interval', () => {
    const CUSTOM_INTERVAL = 120000
    const code = generateStatWidget(['total_clusters'], 'http://localhost:8080', CUSTOM_INTERVAL)
    expect(code).toContain(`refreshFrequency = ${CUSTOM_INTERVAL}`)
  })

  it('throws for empty stat IDs', () => {
    expect(() => generateStatWidget([], 'http://localhost:8080'))
      .toThrow('No valid stat IDs provided')
  })

  it('filters out invalid stat IDs', () => {
    expect(() => generateStatWidget(['nonexistent_stat'], 'http://localhost:8080'))
      .toThrow('No valid stat IDs provided')
  })
})

describe('generateTemplateWidget', () => {
  it('generates widget code for cluster_overview template', () => {
    const code = generateTemplateWidget('cluster_overview', 'http://localhost:8080')
    expect(code).toContain('Cluster Overview Widget')
    expect(code).toContain('export const command')
    expect(code).toContain('export const render')
  })

  it('generates widget code for stat_bar template', () => {
    const code = generateTemplateWidget('stat_bar', 'http://localhost:8080')
    expect(code).toContain('Stats Bar Widget')
  })

  it('throws for unknown template', () => {
    expect(() => generateTemplateWidget('nonexistent_template', 'http://localhost:8080'))
      .toThrow('Unknown template: nonexistent_template')
  })
})

describe('generateWidget', () => {
  it('dispatches to card generator', () => {
    const config: WidgetConfig = {
      type: 'card',
      cardType: 'cluster_health',
      apiEndpoint: 'http://localhost:8080',
      refreshInterval: 30000,
      theme: 'dark',
    }
    const code = generateWidget(config)
    expect(code).toContain('Cluster Health Widget')
  })

  it('dispatches to stat generator', () => {
    const config: WidgetConfig = {
      type: 'stat',
      statIds: ['total_clusters'],
      apiEndpoint: 'http://localhost:8080',
      refreshInterval: 60000,
      theme: 'dark',
    }
    const code = generateWidget(config)
    expect(code).toContain('Stats Widget')
  })

  it('dispatches to template generator', () => {
    const config: WidgetConfig = {
      type: 'template',
      templateId: 'cluster_overview',
      apiEndpoint: 'http://localhost:8080',
      refreshInterval: 30000,
      theme: 'dark',
    }
    const code = generateWidget(config)
    expect(code).toContain('Cluster Overview Widget')
  })

  it('throws for missing cardType on card widget', () => {
    const config: WidgetConfig = {
      type: 'card',
      apiEndpoint: 'http://localhost:8080',
      refreshInterval: 30000,
      theme: 'dark',
    }
    expect(() => generateWidget(config)).toThrow('cardType required')
  })

  it('throws for missing statIds on stat widget', () => {
    const config: WidgetConfig = {
      type: 'stat',
      apiEndpoint: 'http://localhost:8080',
      refreshInterval: 30000,
      theme: 'dark',
    }
    expect(() => generateWidget(config)).toThrow('statIds required')
  })

  it('throws for missing templateId on template widget', () => {
    const config: WidgetConfig = {
      type: 'template',
      apiEndpoint: 'http://localhost:8080',
      refreshInterval: 30000,
      theme: 'dark',
    }
    expect(() => generateWidget(config)).toThrow('templateId required')
  })
})

describe('getWidgetFilename', () => {
  it('generates card widget filename', () => {
    const config: WidgetConfig = {
      type: 'card',
      cardType: 'cluster_health',
      apiEndpoint: '',
      refreshInterval: 30000,
      theme: 'dark',
    }
    expect(getWidgetFilename(config)).toBe('cluster-health.widget.jsx')
  })

  it('generates stat widget filename', () => {
    const config: WidgetConfig = {
      type: 'stat',
      statIds: ['total_clusters', 'total_pods'],
      apiEndpoint: '',
      refreshInterval: 30000,
      theme: 'dark',
    }
    expect(getWidgetFilename(config)).toBe('stats-total_clusters-total_pods.widget.jsx')
  })

  it('generates template widget filename', () => {
    const config: WidgetConfig = {
      type: 'template',
      templateId: 'cluster_overview',
      apiEndpoint: '',
      refreshInterval: 30000,
      theme: 'dark',
    }
    expect(getWidgetFilename(config)).toBe('cluster-overview.widget.jsx')
  })

  it('returns default filename for unknown type', () => {
    const config = {
      type: 'unknown' as 'card',
      apiEndpoint: '',
      refreshInterval: 30000,
      theme: 'dark' as const,
    }
    expect(getWidgetFilename(config)).toBe('widget.jsx')
  })
})

// --- Regression tests for #6703, #6704, #6705, #6706 -----------------------
// These cover:
//  - #6705: generated JSX must not allow a user-controlled display name to
//    inject executable markup.
//  - #6703: template widgets that contain ONLY stats (no cards) must not
//    produce an invalid curl command.
//  - #6704: stat data-path extraction must support bracket/index notation.
//  - #6706: the widget test suite was missing both #6703 and #6704 before
//    this change.

describe('generator hardening', () => {
  // Minimal snapshot of the module-under-test so we can inject a hostile
  // card displayName without touching the shared WIDGET_CARDS registry at
  // runtime. Using vi.doMock would require isolateModules gymnastics — we
  // instead exploit the fact that WIDGET_CARDS is mutable at test time.
  it('does not inject executable <script> into generated JSX when title has HTML (default card branch)', async () => {
    const { WIDGET_CARDS } = await import('../widgetRegistry')
    const HOSTILE_TYPE = '__hostile_test_card__'
    const HOSTILE_TITLE = '</div><script>alert(1)</script>'
    // Use a card type that falls through to the default render branch in
    // generateCardRenderFunction — that's the branch that interpolates the
    // title directly into the JSX source.
    ;(WIDGET_CARDS as Record<string, unknown>)[HOSTILE_TYPE] = {
      type: HOSTILE_TYPE,
      displayName: HOSTILE_TITLE,
      description: 'test only',
      apiEndpoints: ['/api/test'],
    }
    try {
      const code = generateCardWidget(HOSTILE_TYPE, 'http://localhost:8080')
      // Strip every single- and double-quoted string literal and every
      // line/block comment, then assert the generated source has no live
      // <script> markup left behind. The hostile title only gets emitted
      // inside a `{"..."}` JSX expression (JSON.stringify), so after
      // scrubbing string literals it must be gone. If the implementation
      // regresses and interpolates the title raw into JSX, the
      // <script> tag will survive the scrub and this test will catch it.
      const scrubbed = code
        // strip block comments
        .replace(/\/\*[\s\S]*?\*\//g, '')
        // strip line comments
        .replace(/\/\/.*$/gm, '')
        // strip double-quoted strings
        .replace(/"(?:[^"\\]|\\.)*"/g, '""')
        // strip single-quoted strings
        .replace(/'(?:[^'\\]|\\.)*'/g, "''")
        // strip template literals
        .replace(/`(?:[^`\\]|\\.)*`/g, '``')
      expect(scrubbed).not.toContain('<script')
      expect(scrubbed).not.toContain('alert(1)')
      // And it should round-trip through JSON.stringify inside braces.
      expect(code).toContain(JSON.stringify(HOSTILE_TITLE))
    } finally {
      delete (WIDGET_CARDS as Record<string, unknown>)[HOSTILE_TYPE]
    }
  })

  it('throws a clear error when a stats-only template has no resolvable endpoint', async () => {
    const { WIDGET_TEMPLATES, WIDGET_STATS } = await import('../widgetRegistry')
    const STATS_ONLY_ID = '__stats_only_no_endpoint__'
    const BROKEN_STAT_ID = '__broken_stat__'
    ;(WIDGET_STATS as Record<string, unknown>)[BROKEN_STAT_ID] = {
      id: BROKEN_STAT_ID,
      displayName: 'Broken',
      apiEndpoint: '', // missing endpoint is the failure mode under test
      dataPath: 'foo',
      color: '#fff',
      format: 'number',
    }
    ;(WIDGET_TEMPLATES as Record<string, unknown>)[STATS_ONLY_ID] = {
      id: STATS_ONLY_ID,
      displayName: 'Stats Only',
      description: 'test only',
      cards: [],
      stats: [BROKEN_STAT_ID],
      layout: 'row',
    }
    try {
      expect(() => generateTemplateWidget(STATS_ONLY_ID, 'http://localhost:8080'))
        .toThrow(/no resolvable data endpoint/)
    } finally {
      delete (WIDGET_TEMPLATES as Record<string, unknown>)[STATS_ONLY_ID]
      delete (WIDGET_STATS as Record<string, unknown>)[BROKEN_STAT_ID]
    }
  })

  it('generated stat widget extractor supports bracket/index notation for dataPath', async () => {
    const { WIDGET_STATS } = await import('../widgetRegistry')
    const BRACKET_STAT_ID = '__bracket_stat__'
    ;(WIDGET_STATS as Record<string, unknown>)[BRACKET_STAT_ID] = {
      id: BRACKET_STAT_ID,
      displayName: 'Bracket Stat',
      apiEndpoint: '/api/test',
      dataPath: 'items[0].foo.bar',
      color: '#fff',
      format: 'number',
    }
    try {
      const code = generateStatWidget([BRACKET_STAT_ID], 'http://localhost:8080')
      // The generated getData helper should NOT be the naive split('.')
      // that would produce src['items[0]'] and always return 0.
      expect(code).not.toMatch(/path\.split\('\.'\)\.reduce\(/)
      // It should include the bracket-normalization we introduced.
      expect(code).toMatch(/replace\(\/\\\[/)
      // The dataPath must still be passed through literally.
      expect(code).toContain("getData('items[0].foo.bar', data)")

      // And functionally: evaluate the generated helper to confirm it
      // walks bracket notation correctly. We extract the helper by name
      // and eval it in isolation.
      const helperMatch = code.match(/const getData = \(path, src\) => \{[\s\S]*?\n {2}\};/)
      expect(helperMatch).toBeTruthy()
      const getData = new Function(`${helperMatch![0]}; return getData;`)() as (
        path: string,
        src: unknown,
      ) => unknown
      const sample = { items: [{ foo: { bar: 42 } }] }
      expect(getData('items[0].foo.bar', sample)).toBe(42)
      expect(getData('missing.path', sample)).toBe(0)
    } finally {
      delete (WIDGET_STATS as Record<string, unknown>)[BRACKET_STAT_ID]
    }
  })
})
