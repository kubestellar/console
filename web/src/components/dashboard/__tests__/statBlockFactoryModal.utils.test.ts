import { describe, expect, it } from 'vitest'
import { HelpCircle, Server, CheckCircle2, XCircle, AlertTriangle, Cpu, MemoryStick, HardDrive, Wifi, Clock, Users, Shield, GitBranch, Box, Layers } from 'lucide-react'

import {
  AVAILABLE_COLORS,
  DEMO_STAT_VALUE,
  ICON_MAP,
  POPULAR_ICONS,
  SAVE_MESSAGE_TIMEOUT_MS,
  STAT_BLOCK_ID_PREFIX,
  VALID_COLORS,
  VALUE_FORMATS,
  buildStatBlockDefinitions,
  buildStatsDefinition,
  createEmptyBlock,
  createStatBlockId,
  getIcon,
  getSmartDefault,
  validateStatAssistResult,
  validateStatBlockResult,
} from '../statBlockFactoryModal.utils'
import type { BlockEditorItem } from '../statBlockFactoryModal.types'

const makeBlock = (overrides: Partial<BlockEditorItem> = {}): BlockEditorItem => ({
  id: 'b1',
  label: 'Requests',
  icon: 'Activity',
  color: 'purple',
  field: 'count',
  format: 'number',
  tooltip: 'Total requests',
  ...overrides,
})

describe('statBlockFactoryModal.utils — constants', () => {
  it('DEMO_STAT_VALUE = 42', () => {
    expect(DEMO_STAT_VALUE).toBe(42)
  })

  it('SAVE_MESSAGE_TIMEOUT_MS = 3000', () => {
    expect(SAVE_MESSAGE_TIMEOUT_MS).toBe(3000)
  })

  it('STAT_BLOCK_ID_PREFIX = "stat-block"', () => {
    expect(STAT_BLOCK_ID_PREFIX).toBe('stat-block')
  })

  it('AVAILABLE_COLORS lists the 8 canonical colors', () => {
    expect(AVAILABLE_COLORS).toEqual(['purple', 'blue', 'green', 'yellow', 'orange', 'red', 'cyan', 'gray'])
  })

  it('POPULAR_ICONS contains 29 entries with no duplicates', () => {
    expect(POPULAR_ICONS).toHaveLength(29)
    expect(new Set(POPULAR_ICONS).size).toBe(29)
  })

  it('every POPULAR_ICONS entry is present in ICON_MAP', () => {
    for (const name of POPULAR_ICONS) {
      expect(ICON_MAP[name]).toBeDefined()
    }
  })

  it('ICON_MAP contains HelpCircle fallback beyond popular icons', () => {
    expect(ICON_MAP.HelpCircle).toBe(HelpCircle)
  })

  it('VALID_COLORS is a Set of AVAILABLE_COLORS', () => {
    expect(VALID_COLORS).toBeInstanceOf(Set)
    expect(VALID_COLORS.size).toBe(AVAILABLE_COLORS.length)
    for (const c of AVAILABLE_COLORS) expect(VALID_COLORS.has(c)).toBe(true)
  })

  it('VALUE_FORMATS starts with a blank None option', () => {
    expect(VALUE_FORMATS[0]).toEqual({ value: '', label: 'None' })
    expect(VALUE_FORMATS.map((f) => f.value)).toEqual(['', 'number', 'percent', 'bytes', 'currency', 'duration'])
  })
})

describe('getIcon', () => {
  it('returns the mapped icon for a known name', () => {
    expect(getIcon('Server')).toBe(Server)
    expect(getIcon('Cpu')).toBe(Cpu)
  })

  it('falls back to HelpCircle for unknown names', () => {
    expect(getIcon('DoesNotExist')).toBe(HelpCircle)
  })

  it('falls back to HelpCircle for empty string', () => {
    expect(getIcon('')).toBe(HelpCircle)
  })
})

describe('getSmartDefault', () => {
  it('returns null for empty/whitespace-only labels', () => {
    expect(getSmartDefault('')).toBeNull()
    expect(getSmartDefault('   ')).toBeNull()
  })

  it('returns null when no pattern matches', () => {
    expect(getSmartDefault('something arbitrary')).toBeNull()
  })

  it('matches status keywords case-insensitively (healthy/success/etc.)', () => {
    expect(getSmartDefault('healthy')).toEqual({ icon: 'CheckCircle2', color: 'green' })
    expect(getSmartDefault('ONLINE')).toEqual({ icon: 'CheckCircle2', color: 'green' })
    expect(getSmartDefault('Success')).toEqual({ icon: 'CheckCircle2', color: 'green' })
  })

  it('maps error/failure keywords to XCircle/red', () => {
    expect(getSmartDefault('error')).toEqual({ icon: 'XCircle', color: 'red' })
    expect(getSmartDefault('failed')).toEqual({ icon: 'XCircle', color: 'red' })
    expect(getSmartDefault('offline')).toEqual({ icon: 'XCircle', color: 'red' })
  })

  it('maps warning keywords to AlertTriangle/yellow', () => {
    expect(getSmartDefault('warning')).toEqual({ icon: 'AlertTriangle', color: 'yellow' })
    expect(getSmartDefault('degraded')).toEqual({ icon: 'AlertTriangle', color: 'yellow' })
  })

  it('maps aggregate keywords (total/count/instances) to Server/purple', () => {
    expect(getSmartDefault('total')).toEqual({ icon: 'Server', color: 'purple' })
    expect(getSmartDefault('instances')).toEqual({ icon: 'Server', color: 'purple' })
    expect(getSmartDefault('instance')).toEqual({ icon: 'Server', color: 'purple' })
  })

  it('matches prefix patterns for cpu, mem, disk', () => {
    expect(getSmartDefault('cpu usage')).toEqual({ icon: 'Cpu', color: 'blue' })
    expect(getSmartDefault('memory used')).toEqual({ icon: 'MemoryStick', color: 'cyan' })
    expect(getSmartDefault('disk free')).toEqual({ icon: 'HardDrive', color: 'orange' })
    expect(getSmartDefault('storage size')).toEqual({ icon: 'HardDrive', color: 'orange' })
  })

  it('matches prefix patterns for network, latency, users, security', () => {
    expect(getSmartDefault('network throughput')).toEqual({ icon: 'Wifi', color: 'blue' })
    expect(getSmartDefault('latency p99')).toEqual({ icon: 'Clock', color: 'yellow' })
    expect(getSmartDefault('users online')).toEqual({ icon: 'Users', color: 'blue' })
    expect(getSmartDefault('security incidents')).toEqual({ icon: 'Shield', color: 'red' })
  })

  it('matches prefix patterns for deploy, node, pod, namespace', () => {
    expect(getSmartDefault('deploy count')).toEqual({ icon: 'GitBranch', color: 'purple' })
    expect(getSmartDefault('node pool')).toEqual({ icon: 'Server', color: 'blue' })
    expect(getSmartDefault('pods running')).toEqual({ icon: 'Box', color: 'cyan' })
    expect(getSmartDefault('namespace scope')).toEqual({ icon: 'Layers', color: 'blue' })
  })

  it('trims whitespace before matching', () => {
    expect(getSmartDefault('   healthy   ')).toEqual({ icon: 'CheckCircle2', color: 'green' })
  })

  it('returns null when suffix keywords appear (patterns are anchored)', () => {
    // status keywords use ^...$ anchors — "very healthy" should not match
    expect(getSmartDefault('very healthy')).toBeNull()
  })

  it('every returned icon name is resolvable via ICON_MAP', () => {
    const inputs = ['healthy', 'error', 'warning', 'total', 'cpu', 'mem', 'disk', 'network', 'latency', 'user', 'security', 'deploy', 'node', 'pod', 'namespace']
    for (const input of inputs) {
      const result = getSmartDefault(input)
      expect(result).not.toBeNull()
      expect(ICON_MAP[result!.icon]).toBeDefined()
    }
  })

  it('every returned color is in VALID_COLORS', () => {
    const inputs = ['healthy', 'error', 'warning', 'total', 'cpu', 'mem', 'disk', 'network', 'latency']
    for (const input of inputs) {
      const result = getSmartDefault(input)
      expect(VALID_COLORS.has(result!.color)).toBe(true)
    }
  })
})

describe('createStatBlockId', () => {
  it('starts with the STAT_BLOCK_ID_PREFIX', () => {
    expect(createStatBlockId().startsWith(`${STAT_BLOCK_ID_PREFIX}-`)).toBe(true)
  })

  it('produces unique IDs on successive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => createStatBlockId()))
    expect(ids.size).toBe(20)
  })
})

describe('createEmptyBlock', () => {
  it('returns a fresh block with empty label/field/format/tooltip', () => {
    const b = createEmptyBlock()
    expect(b.label).toBe('')
    expect(b.field).toBe('')
    expect(b.format).toBe('')
    expect(b.tooltip).toBe('')
  })

  it('defaults to Activity icon and purple color', () => {
    const b = createEmptyBlock()
    expect(b.icon).toBe('Activity')
    expect(b.color).toBe('purple')
  })

  it('assigns a unique prefixed id', () => {
    const a = createEmptyBlock()
    const b = createEmptyBlock()
    expect(a.id).not.toBe(b.id)
    expect(a.id.startsWith(`${STAT_BLOCK_ID_PREFIX}-`)).toBe(true)
  })
})

describe('validateStatAssistResult', () => {
  it('rejects data missing both title and blocks', () => {
    const result = validateStatAssistResult({})
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toContain('title or blocks')
  })

  it('accepts data with only title', () => {
    expect(validateStatAssistResult({ title: 'My Stats' }).valid).toBe(true)
  })

  it('accepts data with only blocks', () => {
    expect(validateStatAssistResult({ blocks: [] }).valid).toBe(true)
  })

  it('accepts data with both', () => {
    expect(validateStatAssistResult({ title: 'x', blocks: [] }).valid).toBe(true)
  })
})

describe('validateStatBlockResult', () => {
  it('rejects when title is missing', () => {
    const r = validateStatBlockResult({ blocks: [{ label: 'x' }] })
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.error).toMatch(/title/i)
  })

  it('rejects when title is not a string', () => {
    const r = validateStatBlockResult({ title: 123, blocks: [{ label: 'x' }] })
    expect(r.valid).toBe(false)
  })

  it('rejects when blocks is missing', () => {
    const r = validateStatBlockResult({ title: 'ok' })
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.error).toMatch(/blocks/i)
  })

  it('rejects when blocks is not an array', () => {
    const r = validateStatBlockResult({ title: 'ok', blocks: 'not-array' })
    expect(r.valid).toBe(false)
  })

  it('rejects when blocks is an empty array', () => {
    const r = validateStatBlockResult({ title: 'ok', blocks: [] })
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.error).toMatch(/empty/i)
  })

  it('accepts valid input unchanged', () => {
    const input = { title: 'ok', blocks: [{ label: 'x', color: 'blue' }] }
    const r = validateStatBlockResult(input)
    expect(r.valid).toBe(true)
    if (r.valid) expect((r.result as unknown as typeof input).blocks[0].color).toBe('blue')
  })

  it('auto-corrects invalid colors to purple', () => {
    const input = { title: 'ok', blocks: [{ label: 'x', color: 'neon-pink' }] }
    const r = validateStatBlockResult(input)
    expect(r.valid).toBe(true)
    if (r.valid) expect((r.result as unknown as typeof input).blocks[0].color).toBe('purple')
  })

  it('assigns purple when color is missing', () => {
    const input = { title: 'ok', blocks: [{ label: 'x' }] }
    const r = validateStatBlockResult(input)
    expect(r.valid).toBe(true)
    if (r.valid) expect((r.result as unknown as { blocks: { color: string }[] }).blocks[0].color).toBe('purple')
  })

  it('mutates input in place (documents current behaviour)', () => {
    const input = { title: 'ok', blocks: [{ label: 'x', color: 'not-a-color' }] }
    validateStatBlockResult(input)
    expect(input.blocks[0].color).toBe('purple')
  })

  it('leaves each valid color untouched across multiple blocks', () => {
    const input = {
      title: 'ok',
      blocks: [
        { label: 'a', color: 'green' },
        { label: 'b', color: 'invalid' },
        { label: 'c', color: 'red' },
      ],
    }
    validateStatBlockResult(input)
    expect(input.blocks.map((b) => b.color)).toEqual(['green', 'purple', 'red'])
  })
})

describe('buildStatBlockDefinitions', () => {
  it('filters out blocks with empty or whitespace-only labels', () => {
    const blocks = [makeBlock({ label: '' }), makeBlock({ label: '   ' }), makeBlock({ label: 'Keep' })]
    const defs = buildStatBlockDefinitions(blocks)
    expect(defs).toHaveLength(1)
    expect(defs[0].label).toBe('Keep')
  })

  it('assigns sequential order starting at 0', () => {
    const blocks = [makeBlock({ label: 'a' }), makeBlock({ label: 'b' }), makeBlock({ label: 'c' })]
    const defs = buildStatBlockDefinitions(blocks)
    expect(defs.map((d) => d.order)).toEqual([0, 1, 2])
  })

  it('marks every definition visible', () => {
    const defs = buildStatBlockDefinitions([makeBlock({ label: 'x' })])
    expect(defs[0].visible).toBe(true)
  })

  it('uses fallback id block_<idx> when block.id is empty', () => {
    const defs = buildStatBlockDefinitions([makeBlock({ id: '', label: 'x' })])
    expect(defs[0].id).toBe('block_0')
  })

  it('emits valueSource when field is set', () => {
    const defs = buildStatBlockDefinitions([makeBlock({ label: 'x', field: 'count', format: 'number' })])
    expect(defs[0].valueSource).toEqual({ field: 'count', format: 'number' })
  })

  it('omits valueSource when field is empty', () => {
    const defs = buildStatBlockDefinitions([makeBlock({ label: 'x', field: '' })])
    expect(defs[0].valueSource).toBeUndefined()
  })

  it('collapses empty format to undefined inside valueSource', () => {
    const defs = buildStatBlockDefinitions([makeBlock({ label: 'x', field: 'count', format: '' })])
    expect(defs[0].valueSource).toEqual({ field: 'count', format: undefined })
  })

  it('collapses empty tooltip to undefined', () => {
    const defs = buildStatBlockDefinitions([makeBlock({ label: 'x', tooltip: '' })])
    expect(defs[0].tooltip).toBeUndefined()
  })

  it('preserves non-empty tooltip', () => {
    const defs = buildStatBlockDefinitions([makeBlock({ label: 'x', tooltip: 'help' })])
    expect(defs[0].tooltip).toBe('help')
  })

  it('returns empty array for empty input', () => {
    expect(buildStatBlockDefinitions([])).toEqual([])
  })
})

describe('buildStatsDefinition', () => {
  it('trims title', () => {
    const def = buildStatsDefinition('custom', '  My Stats  ', [], 0)
    expect(def.title).toBe('My Stats')
  })

  it('falls back to "Custom Stats" for empty/whitespace title', () => {
    expect(buildStatsDefinition('t', '', [], 0).title).toBe('Custom Stats')
    expect(buildStatsDefinition('t', '   ', [], 0).title).toBe('Custom Stats')
  })

  it('passes type through verbatim', () => {
    expect(buildStatsDefinition('my-type', 'x', [], 0).type).toBe('my-type')
  })

  it('sets defaultCollapsed to false', () => {
    expect(buildStatsDefinition('t', 'x', [], 0).defaultCollapsed).toBe(false)
  })

  it('omits grid when gridCols <= 0', () => {
    expect(buildStatsDefinition('t', 'x', [], 0).grid).toBeUndefined()
    expect(buildStatsDefinition('t', 'x', [], -1).grid).toBeUndefined()
  })

  it('sets grid.columns when gridCols > 0', () => {
    expect(buildStatsDefinition('t', 'x', [], 4).grid).toEqual({ columns: 4 })
  })

  it('embeds block definitions via buildStatBlockDefinitions', () => {
    const def = buildStatsDefinition('t', 'x', [makeBlock({ label: 'a' }), makeBlock({ label: '' })], 2)
    expect(def.blocks).toHaveLength(1)
    expect(def.blocks[0].label).toBe('a')
  })
})

// Sanity: silence unused-import lint if any icon isn't referenced above
void [CheckCircle2, XCircle, AlertTriangle, MemoryStick, HardDrive, Wifi, Clock, Users, Shield, GitBranch, Box, Layers]
