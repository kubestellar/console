import { describe, it, expect } from 'vitest'
import { generateSampleData, detectFieldFormat } from '../sampleData'
import type { DynamicCardColumn } from '../../dynamic-cards/types'

describe('ai/sampleData', () => {
  describe('generateSampleData', () => {
    it('returns empty array for empty columns', () => {
      expect(generateSampleData([])).toEqual([])
    })

    it('generates 5 rows by default', () => {
      const columns: DynamicCardColumn[] = [{ field: 'name', label: 'Name' }]
      const data = generateSampleData(columns)
      expect(data).toHaveLength(5)
    })

    it('generates Kubernetes names for "name" field', () => {
      const columns: DynamicCardColumn[] = [{ field: 'name', label: 'Name' }]
      const data = generateSampleData(columns)
      expect(data[0].name).toBeTruthy()
      expect(typeof data[0].name).toBe('string')
    })

    it('generates namespace values for "namespace" field', () => {
      const columns: DynamicCardColumn[] = [{ field: 'namespace', label: 'NS' }]
      const data = generateSampleData(columns)
      const namespaces = ['default', 'kube-system', 'production', 'staging', 'monitoring']
      expect(namespaces).toContain(data[0].namespace)
    })

    it('generates status values for "status" field', () => {
      const columns: DynamicCardColumn[] = [{ field: 'status', label: 'Status' }]
      const data = generateSampleData(columns)
      const validStatuses = ['Running', 'Pending', 'Failed', 'Succeeded', 'Unknown']
      expect(validStatuses).toContain(data[0].status)
    })

    it('generates restart counts for "restarts" field', () => {
      const columns: DynamicCardColumn[] = [{ field: 'restarts', label: 'Restarts' }]
      const data = generateSampleData(columns)
      expect(typeof data[0].restarts).toBe('number')
    })

    it('generates cluster names for "cluster" field', () => {
      const columns: DynamicCardColumn[] = [{ field: 'cluster', label: 'Cluster' }]
      const data = generateSampleData(columns)
      expect(typeof data[0].cluster).toBe('string')
      expect((data[0].cluster as string).length).toBeGreaterThan(0)
    })

    it('generates fallback values for unknown fields', () => {
      const columns: DynamicCardColumn[] = [{ field: 'customField', label: 'Custom' }]
      const data = generateSampleData(columns)
      expect(data[0].customField).toBe('value-1')
      expect(data[1].customField).toBe('value-2')
    })

    it('generates multiple columns correctly', () => {
      const columns: DynamicCardColumn[] = [
        { field: 'name', label: 'Name' },
        { field: 'status', label: 'Status' },
        { field: 'restarts', label: 'Restarts' },
      ]
      const data = generateSampleData(columns)
      expect(data[0]).toHaveProperty('name')
      expect(data[0]).toHaveProperty('status')
      expect(data[0]).toHaveProperty('restarts')
    })

    it('skips columns with empty field names', () => {
      const columns: DynamicCardColumn[] = [
        { field: '', label: 'Empty' },
        { field: 'name', label: 'Name' },
      ]
      const data = generateSampleData(columns)
      // Empty field name should be skipped - check it's not in the row's keys
      expect(Object.keys(data[0])).not.toContain('')
      expect(data[0]).toHaveProperty('name')
    })

    it('generates IP addresses for "ip" field', () => {
      const columns: DynamicCardColumn[] = [{ field: 'ip', label: 'IP' }]
      const data = generateSampleData(columns)
      expect((data[0].ip as string)).toMatch(/^\d+\.\d+\.\d+\.\d+$/)
    })
  })

  describe('detectFieldFormat', () => {
    it('detects status field as badge format', () => {
      const result = detectFieldFormat('status', ['Running', 'Pending', 'Failed'])
      expect(result.format).toBe('badge')
      expect(result.badgeColors).toBeDefined()
      expect(result.badgeColors!['Running']).toContain('green')
    })

    it('detects health field as badge format', () => {
      const result = detectFieldFormat('health', ['Healthy', 'Degraded'])
      expect(result.format).toBe('badge')
      expect(result.badgeColors!['Healthy']).toContain('green')
      expect(result.badgeColors!['Degraded']).toContain('yellow')
    })

    it('detects restarts as number format', () => {
      const result = detectFieldFormat('restarts', [0, 2, 5])
      expect(result.format).toBe('number')
    })

    it('detects count as number format', () => {
      const result = detectFieldFormat('count', [10, 20, 30])
      expect(result.format).toBe('number')
    })

    it('detects all-numeric values as number format', () => {
      const result = detectFieldFormat('customMetric', [1, 2, 3])
      expect(result.format).toBe('number')
    })

    it('defaults to text format for unknown string fields', () => {
      const result = detectFieldFormat('description', ['hello', 'world'])
      expect(result.format).toBe('text')
    })

    it('assigns correct badge colors for failed status', () => {
      const result = detectFieldFormat('status', ['Failed'])
      expect(result.format).toBe('badge')
      expect(result.badgeColors!['Failed']).toContain('red')
    })

    it('assigns gray badge for unknown status values', () => {
      const result = detectFieldFormat('status', ['Unknown'])
      expect(result.format).toBe('badge')
      expect(result.badgeColors!['Unknown']).toContain('gray')
    })

    it('assigns blue badge for unrecognized badge values', () => {
      const result = detectFieldFormat('phase', ['CustomPhase'])
      expect(result.format).toBe('badge')
      expect(result.badgeColors!['CustomPhase']).toContain('blue')
    })
  })
})
