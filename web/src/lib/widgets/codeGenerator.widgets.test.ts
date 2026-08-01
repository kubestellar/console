import { describe, it, expect } from 'vitest'
import {
  generateCardWidget,
  generateStatWidget,
  generateTemplateWidget,
  generateMiniStatComponent,
} from './codeGenerator.widgets'
import { WIDGET_CARDS, WIDGET_STATS, WIDGET_TEMPLATES } from './widgetRegistry'

const anyCardType = Object.keys(WIDGET_CARDS)[0]
const anyStatId = Object.keys(WIDGET_STATS)[0]
const anyTemplateId = Object.keys(WIDGET_TEMPLATES)[0]

describe('generateCardWidget', () => {
  it('throws for unknown card type', () => {
    expect(() => generateCardWidget('__not_a_card__', 'http://localhost:8080')).toThrow(
      /Unknown card type/,
    )
  })

  it('embeds displayName and description from the registry', () => {
    const card = WIDGET_CARDS[anyCardType]
    const out = generateCardWidget(anyCardType, 'http://localhost:8080')
    expect(out).toContain(card.displayName)
    expect(out).toContain(card.description)
  })

  it('appends the ubersicht-widget source query param to the curl URL', () => {
    const out = generateCardWidget(anyCardType, 'http://localhost:8080')
    expect(out).toContain('source=ubersicht-widget')
  })

  it('uses the default refresh interval of 30000ms when omitted', () => {
    const out = generateCardWidget(anyCardType, 'http://localhost:8080')
    expect(out).toContain('export const refreshFrequency = 30000')
  })

  it('respects a custom refresh interval', () => {
    const out = generateCardWidget(anyCardType, 'http://localhost:8080', 90_000)
    expect(out).toContain('export const refreshFrequency = 90000')
  })

  it('replaces underscores in the card type when naming the widget', () => {
    // Find a card type containing an underscore (most of them do)
    const underscored = Object.keys(WIDGET_CARDS).find((k) => k.includes('_'))
    if (!underscored) return
    const out = generateCardWidget(underscored, 'http://localhost:8080')
    expect(out).toContain(underscored.replace(/_/g, '-'))
  })

  it('strips a trailing /api from the console URL used in the widget shell', () => {
    // consoleUrl is derived by removing trailing /api from apiEndpoint.
    const out = generateCardWidget(anyCardType, 'http://myhost:9000/api')
    expect(out).toContain('http://myhost:9000')
    // Ensure we do not end up with a lingering '/api' segment for the console UI URL.
    expect(out).not.toMatch(/http:\/\/myhost:9000\/api[^/]/)
  })

  it('uses the fallback console URL when apiEndpoint is empty', () => {
    const out = generateCardWidget(anyCardType, '')
    expect(out).toContain('http://localhost:8080')
  })
})

describe('generateStatWidget', () => {
  it('throws when no valid stat IDs are provided', () => {
    expect(() => generateStatWidget(['__no_such_stat__'], 'http://localhost:8081')).toThrow(
      /No valid stat IDs/,
    )
  })

  it('throws when the stat ID list is empty', () => {
    expect(() => generateStatWidget([], 'http://localhost:8081')).toThrow(/No valid stat IDs/)
  })

  it('filters out unknown stat IDs but succeeds if at least one is valid', () => {
    const out = generateStatWidget([anyStatId, '__no_such_stat__'], 'http://localhost:8081')
    expect(out).toContain(WIDGET_STATS[anyStatId].displayName)
  })

  it('includes display names of all valid stats in the generated header comment', () => {
    const ids = Object.keys(WIDGET_STATS).slice(0, 2)
    const out = generateStatWidget(ids, 'http://localhost:8081')
    for (const id of ids) {
      expect(out).toContain(WIDGET_STATS[id].displayName)
    }
  })

  it('defaults refreshFrequency to 60000ms', () => {
    const out = generateStatWidget([anyStatId], 'http://localhost:8081')
    expect(out).toContain('export const refreshFrequency = 60000')
  })

  it('honors a custom refresh interval', () => {
    const out = generateStatWidget([anyStatId], 'http://localhost:8081', 120_000)
    expect(out).toContain('export const refreshFrequency = 120000')
  })

  it('appends the ubersicht-widget source param to the curl URL', () => {
    const out = generateStatWidget([anyStatId], 'http://localhost:8081')
    expect(out).toContain('source=ubersicht-widget')
  })

  it('uses grid layout style when layout=grid', () => {
    const out = generateStatWidget([anyStatId], 'http://localhost:8081', 60_000, 'grid')
    // The grid layout injects gridTemplateColumns; row layout does not.
    expect(out).toContain('gridTemplateColumns')
  })

  it('does not inject gridTemplateColumns for the row layout', () => {
    const out = generateStatWidget([anyStatId], 'http://localhost:8081', 60_000, 'row')
    expect(out).not.toContain('gridTemplateColumns')
  })

  it('falls back to the default base URL when apiEndpoint is empty', () => {
    const out = generateStatWidget([anyStatId], '')
    expect(out).toContain('http://localhost:8081')
  })
})

describe('generateTemplateWidget', () => {
  it('throws for an unknown template ID', () => {
    expect(() =>
      generateTemplateWidget('__no_such_template__', 'http://localhost:8081'),
    ).toThrow(/Unknown template ID/)
  })

  it('embeds the template display name in the generated widget', () => {
    const tpl = WIDGET_TEMPLATES[anyTemplateId]
    const out = generateTemplateWidget(anyTemplateId, 'http://localhost:8081')
    expect(out).toContain(tpl.displayName)
  })

  it('defaults refreshFrequency to 30000ms', () => {
    const out = generateTemplateWidget(anyTemplateId, 'http://localhost:8081')
    expect(out).toContain('export const refreshFrequency = 30000')
  })

  it('honors a custom refresh interval', () => {
    const out = generateTemplateWidget(anyTemplateId, 'http://localhost:8081', 45_000)
    expect(out).toContain('export const refreshFrequency = 45000')
  })

  it('sets WIDGET_NAME to a hyphenated form of the templateId', () => {
    const out = generateTemplateWidget(anyTemplateId, 'http://localhost:8081')
    expect(out).toContain(`WIDGET_NAME = '${anyTemplateId.replace(/_/g, '-')}'`)
  })

  it('inlines mini stat components for each stat referenced by the template', () => {
    // Pick a template that actually declares stats.
    const withStats = Object.entries(WIDGET_TEMPLATES).find(
      ([, t]) => Array.isArray(t.stats) && t.stats.length > 0,
    )
    if (!withStats) return
    const [tplId, tpl] = withStats
    const out = generateTemplateWidget(tplId, 'http://localhost:8081')
    for (const statId of tpl.stats!) {
      if (WIDGET_STATS[statId]) {
        // Component name is the statId with underscores stripped + 'Stat'
        const componentName = statId.replace(/_/g, '') + 'Stat'
        expect(out).toContain(`const ${componentName} =`)
      }
    }
  })
})

describe('generateMiniStatComponent', () => {
  it('returns empty string for an unknown stat id', () => {
    expect(generateMiniStatComponent('__no_such_stat__')).toBe('')
  })

  it('builds a component whose name has underscores stripped and Stat suffix', () => {
    const out = generateMiniStatComponent(anyStatId)
    const expected = anyStatId.replace(/_/g, '') + 'Stat'
    expect(out).toContain(`const ${expected} =`)
  })

  it('embeds the stat color and display name', () => {
    const stat = WIDGET_STATS[anyStatId]
    const out = generateMiniStatComponent(anyStatId)
    expect(out).toContain(stat.color)
    expect(out).toContain(stat.displayName)
  })

  it('appends a percent sign for percentage-format stats', () => {
    const pct = Object.entries(WIDGET_STATS).find(([, s]) => s.format === 'percentage')
    if (!pct) return
    const [id] = pct
    const out = generateMiniStatComponent(id)
    // The percent literal is emitted directly into the generated JSX text.
    expect(out).toContain('}%<')
  })

  it('does not append a percent sign for non-percentage stats', () => {
    const nonPct = Object.entries(WIDGET_STATS).find(([, s]) => s.format !== 'percentage')
    if (!nonPct) return
    const [id] = nonPct
    const out = generateMiniStatComponent(id)
    expect(out).not.toContain('}%<')
  })

  it('uses array-reduce access pattern when dataPath contains reduce', () => {
    const reducer = Object.entries(WIDGET_STATS).find(([, s]) => s.dataPath.includes('reduce'))
    if (!reducer) return
    const [id, stat] = reducer
    const out = generateMiniStatComponent(id)
    const head = stat.dataPath.split('.')[0]
    expect(out).toContain(`(data?.${head} || [])`)
  })
})
