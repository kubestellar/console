import { describe, it, expect } from 'vitest'
import { SCHEMA_VERSION, CREATE_TABLES_SQL } from '../schema'

describe('cache/schema', () => {
  describe('SCHEMA_VERSION', () => {
    it('is a positive integer', () => {
      expect(Number.isInteger(SCHEMA_VERSION)).toBe(true)
      expect(SCHEMA_VERSION).toBeGreaterThan(0)
    })

    it('is version 1 (initial schema)', () => {
      expect(SCHEMA_VERSION).toBe(1)
    })
  })

  describe('CREATE_TABLES_SQL', () => {
    it('is a non-empty string', () => {
      expect(typeof CREATE_TABLES_SQL).toBe('string')
      expect(CREATE_TABLES_SQL.length).toBeGreaterThan(100)
    })

    it('creates cache_data table', () => {
      expect(CREATE_TABLES_SQL).toContain('CREATE TABLE IF NOT EXISTS cache_data')
    })

    it('creates cache_meta table', () => {
      expect(CREATE_TABLES_SQL).toContain('CREATE TABLE IF NOT EXISTS cache_meta')
    })

    it('creates preferences table', () => {
      expect(CREATE_TABLES_SQL).toContain('CREATE TABLE IF NOT EXISTS preferences')
    })

    it('cache_data has key as primary key', () => {
      expect(CREATE_TABLES_SQL).toMatch(/cache_data[\s\S]*?key\s+TEXT\s+PRIMARY KEY/)
    })

    it('cache_data has timestamp column', () => {
      expect(CREATE_TABLES_SQL).toContain('timestamp')
    })

    it('cache_data has version column', () => {
      expect(CREATE_TABLES_SQL).toMatch(/version\s+INTEGER/)
    })

    it('cache_data has size_bytes column with default', () => {
      expect(CREATE_TABLES_SQL).toMatch(/size_bytes\s+INTEGER\s+DEFAULT\s+0/)
    })

    it('creates index on cache_data timestamp', () => {
      expect(CREATE_TABLES_SQL).toContain('CREATE INDEX IF NOT EXISTS idx_cache_timestamp')
    })

    it('cache_meta tracks consecutive failures', () => {
      expect(CREATE_TABLES_SQL).toContain('consecutive_failures')
    })

    it('cache_meta has last_error column', () => {
      expect(CREATE_TABLES_SQL).toContain('last_error')
    })

    it('preferences has key-value structure', () => {
      expect(CREATE_TABLES_SQL).toMatch(/preferences[\s\S]*?key\s+TEXT\s+PRIMARY KEY/)
      expect(CREATE_TABLES_SQL).toMatch(/preferences[\s\S]*?value\s+TEXT/)
    })
  })
})
