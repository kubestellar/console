/**
 * Additional coverage tests for sampleData.ts
 *
 * Targets uncovered field heuristics in generateFieldValue and
 * edge cases in detectFieldFormat.
 */

import { describe, it, expect } from 'vitest'
import { generateSampleData, detectFieldFormat } from '../sampleData'
import type { DynamicCardColumn } from '../../dynamic-cards/types'

const ROW_COUNT = 5

// ============================================================================
// generateSampleData — untested field heuristics
// ============================================================================

describe('generateSampleData — additional field heuristics', () => {
  it('generates health values for "health" field', () => {
    const columns: DynamicCardColumn[] = [{ field: 'health', label: 'Health' }]
    const data = generateSampleData(columns)
    expect(data).toHaveLength(ROW_COUNT)
    const validValues = ['Healthy', 'Degraded', 'Critical', 'Unknown']
    expect(validValues).toContain(data[0].health)
  })

  it('generates phase values for "phase" field', () => {
    const columns: DynamicCardColumn[] = [{ field: 'phase', label: 'Phase' }]
    const data = generateSampleData(columns)
    const validValues = ['Active', 'Terminating', 'Pending']
    expect(validValues).toContain(data[0].phase)
  })

  it('generates boolean values for "ready" field', () => {
    const columns: DynamicCardColumn[] = [{ field: 'ready', label: 'Ready' }]
    const data = generateSampleData(columns)
    expect(['true', 'false']).toContain(data[0].ready)
  })

  it('generates replica counts for "replicas" field', () => {
    const columns: DynamicCardColumn[] = [{ field: 'replicas', label: 'Replicas' }]
    const data = generateSampleData(columns)
    expect(typeof data[0].replicas).toBe('number')
  })

  it('generates CPU values for "cpu" field', () => {
    const columns: DynamicCardColumn[] = [{ field: 'cpu', label: 'CPU' }]
    const data = generateSampleData(columns)
    const validCpu = ['250m', '500m', '1', '100m', '2']
    expect(validCpu).toContain(data[0].cpu)
  })

  it('generates memory values for "memory" field', () => {
    const columns: DynamicCardColumn[] = [{ field: 'memory', label: 'Memory' }]
    const data = generateSampleData(columns)
    const validMem = ['256Mi', '512Mi', '1Gi', '128Mi', '2Gi']
    expect(validMem).toContain(data[0].memory)
  })

  it('generates age values for "age" field', () => {
    const columns: DynamicCardColumn[] = [{ field: 'age', label: 'Age' }]
    const data = generateSampleData(columns)
    const validAge = ['5d', '12h', '3d', '1h', '30d']
    expect(validAge).toContain(data[0].age)
  })

  it('generates version strings for "version" field', () => {
    const columns: DynamicCardColumn[] = [{ field: 'version', label: 'Version' }]
    const data = generateSampleData(columns)
    expect(typeof data[0].version).toBe('string')
    expect((data[0].version as string).startsWith('v')).toBe(true)
  })

  it('generates type values for "type" field', () => {
    const columns: DynamicCardColumn[] = [{ field: 'type', label: 'Type' }]
    const data = generateSampleData(columns)
    const validTypes = ['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob']
    expect(validTypes).toContain(data[0].type)
  })

  it('generates node names for "node" field', () => {
    const columns: DynamicCardColumn[] = [{ field: 'node', label: 'Node' }]
    const data = generateSampleData(columns)
    expect(typeof data[0].node).toBe('string')
  })

  it('generates port numbers for "port" field', () => {
    const columns: DynamicCardColumn[] = [{ field: 'port', label: 'Port' }]
    const data = generateSampleData(columns)
    const VALID_PORTS = [80, 443, 8080, 3000, 6379]
    expect(VALID_PORTS).toContain(data[0].port)
  })

  it('generates image names for "image" field', () => {
    const columns: DynamicCardColumn[] = [{ field: 'image', label: 'Image' }]
    const data = generateSampleData(columns)
    expect(typeof data[0].image).toBe('string')
    expect((data[0].image as string).includes(':')).toBe(true)
  })

  it('generates container names for "container" field', () => {
    const columns: DynamicCardColumn[] = [{ field: 'container', label: 'Container' }]
    const data = generateSampleData(columns)
    expect(typeof data[0].container).toBe('string')
  })

  it('generates date strings for "created" field', () => {
    const columns: DynamicCardColumn[] = [{ field: 'created', label: 'Created' }]
    const data = generateSampleData(columns)
    // Should be an ISO date string (YYYY-MM-DD)
    expect((data[0].created as string)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('generates date strings for "timestamp" field', () => {
    const columns: DynamicCardColumn[] = [{ field: 'timestamp', label: 'Time' }]
    const data = generateSampleData(columns)
    expect((data[0].timestamp as string)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('generates label strings for "labels" field', () => {
    const columns: DynamicCardColumn[] = [{ field: 'labels', label: 'Labels' }]
    const data = generateSampleData(columns)
    expect(typeof data[0].labels).toBe('string')
    expect((data[0].labels as string).includes('=')).toBe(true)
  })

  it('generates percent values for "percent" field', () => {
    const columns: DynamicCardColumn[] = [{ field: 'percent', label: 'Usage %' }]
    const data = generateSampleData(columns)
    expect(typeof data[0].percent).toBe('number')
  })

  it('generates utilization values for "utilization" field', () => {
    const columns: DynamicCardColumn[] = [{ field: 'utilization', label: 'Util' }]
    const data = generateSampleData(columns)
    expect(typeof data[0].utilization).toBe('number')
  })

  it('generates address for "address" field', () => {
    const columns: DynamicCardColumn[] = [{ field: 'address', label: 'Address' }]
    const data = generateSampleData(columns)
    expect((data[0].address as string)).toMatch(/^\d+\.\d+\.\d+\.\d+$/)
  })

  it('matches "pod_name" as a name field', () => {
    const columns: DynamicCardColumn[] = [{ field: 'pod_name', label: 'Pod Name' }]
    const data = generateSampleData(columns)
    // Should match the K8S_NAMES pattern, not fallback
    expect((data[0].pod_name as string)).not.toMatch(/^value-/)
  })

  it('matches "resource" as a name field', () => {
    const columns: DynamicCardColumn[] = [{ field: 'resource', label: 'Resource' }]
    const data = generateSampleData(columns)
    expect((data[0].resource as string)).not.toMatch(/^value-/)
  })

  it('matches "count" as a numeric field', () => {
    const columns: DynamicCardColumn[] = [{ field: 'count', label: 'Count' }]
    const data = generateSampleData(columns)
    expect(typeof data[0].count).toBe('number')
  })

  it('matches "instances" as a numeric field', () => {
    const columns: DynamicCardColumn[] = [{ field: 'instances', label: 'Instances' }]
    const data = generateSampleData(columns)
    expect(typeof data[0].instances).toBe('number')
  })

  it('matches "desired" as a numeric field', () => {
    const columns: DynamicCardColumn[] = [{ field: 'desired', label: 'Desired' }]
    const data = generateSampleData(columns)
    expect(typeof data[0].desired).toBe('number')
  })

  it('matches "available" as a numeric field', () => {
    const columns: DynamicCardColumn[] = [{ field: 'available', label: 'Available' }]
    const data = generateSampleData(columns)
    expect(typeof data[0].available).toBe('number')
  })
})

// ============================================================================
// detectFieldFormat — additional edge cases
// ============================================================================

describe('detectFieldFormat — additional edge cases', () => {
  it('returns text for status-like field with more than 6 unique values', () => {
    const SEVEN_VALUES = ['Running', 'Pending', 'Failed', 'Succeeded', 'Unknown', 'CrashLoop', 'Terminating']
    const result = detectFieldFormat('status', SEVEN_VALUES)
    expect(result.format).toBe('text')
  })

  it('returns text for empty sample values (non-numeric)', () => {
    const result = detectFieldFormat('description', [])
    expect(result.format).toBe('text')
  })

  it('detects "ready" as badge format', () => {
    const result = detectFieldFormat('ready', ['true', 'false'])
    expect(result.format).toBe('badge')
    expect(result.badgeColors?.['true']).toContain('green')
    expect(result.badgeColors?.['false']).toContain('red')
  })

  it('detects "phase" as badge format', () => {
    const result = detectFieldFormat('phase', ['Active', 'Terminating'])
    expect(result.format).toBe('badge')
    expect(result.badgeColors?.['Active']).toContain('green')
    expect(result.badgeColors?.['Terminating']).toContain('yellow')
  })

  it('detects "state" as badge format', () => {
    const result = detectFieldFormat('state', ['Running', 'Failed'])
    expect(result.format).toBe('badge')
  })

  it('detects "port" as number format', () => {
    const result = detectFieldFormat('port', [80, 443])
    expect(result.format).toBe('number')
  })

  it('detects "total" as number format', () => {
    const result = detectFieldFormat('total', [100])
    expect(result.format).toBe('number')
  })

  it('detects "replicas" as number format', () => {
    const result = detectFieldFormat('replicas', [3, 5])
    expect(result.format).toBe('number')
  })

  it('detects "instances" as number format', () => {
    const result = detectFieldFormat('instances', [2])
    expect(result.format).toBe('number')
  })

  it('detects "desired" as number format', () => {
    const result = detectFieldFormat('desired', [3])
    expect(result.format).toBe('number')
  })

  it('detects "available" as number format', () => {
    const result = detectFieldFormat('available', [2])
    expect(result.format).toBe('number')
  })

  it('detects "percent" as number format', () => {
    const result = detectFieldFormat('percent', [50])
    expect(result.format).toBe('number')
  })

  it('detects "pct" as number format', () => {
    const result = detectFieldFormat('pct', [75])
    expect(result.format).toBe('number')
  })

  it('detects "usage" as number format', () => {
    const result = detectFieldFormat('usage', [80])
    expect(result.format).toBe('number')
  })

  it('detects mixed types as text', () => {
    const result = detectFieldFormat('mixed', ['hello', 42, true])
    expect(result.format).toBe('text')
  })

  it('assigns error badge color', () => {
    const result = detectFieldFormat('status', ['Error'])
    expect(result.format).toBe('badge')
    expect(result.badgeColors?.['Error']).toContain('red')
  })

  it('assigns succeeded badge color', () => {
    const result = detectFieldFormat('status', ['Succeeded'])
    expect(result.format).toBe('badge')
    expect(result.badgeColors?.['Succeeded']).toContain('green')
  })
})
