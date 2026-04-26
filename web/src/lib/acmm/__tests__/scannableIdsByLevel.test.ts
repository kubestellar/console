import { describe, it, expect } from 'vitest'
import {
  SCANNABLE_IDS_BY_LEVEL,
  ACMM_DETECTION_PATHS,
  AGENT_INSTRUCTION_FILE_IDS,
} from '../scannableIdsByLevel'

describe('SCANNABLE_IDS_BY_LEVEL', () => {
  it('covers levels 2 through 6', () => {
    for (let level = 2; level <= 6; level++) {
      expect(SCANNABLE_IDS_BY_LEVEL[level]).toBeDefined()
      expect(Array.isArray(SCANNABLE_IDS_BY_LEVEL[level])).toBe(true)
    }
  })

  it('does not include level 0 or 1', () => {
    expect(SCANNABLE_IDS_BY_LEVEL[0]).toBeUndefined()
    expect(SCANNABLE_IDS_BY_LEVEL[1]).toBeUndefined()
  })

  it('L2 contains the virtual agent-instructions group', () => {
    expect(SCANNABLE_IDS_BY_LEVEL[2]).toContain('acmm:agent-instructions')
  })

  it('L2 does not contain individual instruction-file IDs', () => {
    for (const id of AGENT_INSTRUCTION_FILE_IDS) {
      expect(SCANNABLE_IDS_BY_LEVEL[2]).not.toContain(id)
    }
  })

  it('all IDs are non-empty strings', () => {
    for (const level of Object.keys(SCANNABLE_IDS_BY_LEVEL)) {
      for (const id of SCANNABLE_IDS_BY_LEVEL[Number(level)]) {
        expect(typeof id).toBe('string')
        expect(id.length).toBeGreaterThan(0)
      }
    }
  })

  it('no duplicate IDs within a level', () => {
    for (const level of Object.keys(SCANNABLE_IDS_BY_LEVEL)) {
      const ids = SCANNABLE_IDS_BY_LEVEL[Number(level)]
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})

describe('ACMM_DETECTION_PATHS', () => {
  it('is a non-empty object', () => {
    expect(Object.keys(ACMM_DETECTION_PATHS).length).toBeGreaterThan(0)
  })

  it('each entry maps to a non-empty array of strings', () => {
    for (const [id, patterns] of Object.entries(ACMM_DETECTION_PATHS)) {
      expect(Array.isArray(patterns)).toBe(true)
      expect(patterns.length).toBeGreaterThan(0)
      for (const p of patterns) {
        expect(typeof p).toBe('string')
        expect(p.length).toBeGreaterThan(0)
      }
    }
  })

  it('includes individual instruction-file IDs (not collapsed)', () => {
    for (const id of AGENT_INSTRUCTION_FILE_IDS) {
      expect(ACMM_DETECTION_PATHS[id]).toBeDefined()
    }
  })
})

describe('AGENT_INSTRUCTION_FILE_IDS', () => {
  it('is a Set of 4 instruction file criteria', () => {
    expect(AGENT_INSTRUCTION_FILE_IDS.size).toBe(4)
  })

  it('contains expected IDs', () => {
    expect(AGENT_INSTRUCTION_FILE_IDS.has('acmm:claude-md')).toBe(true)
    expect(AGENT_INSTRUCTION_FILE_IDS.has('acmm:copilot-instructions')).toBe(true)
    expect(AGENT_INSTRUCTION_FILE_IDS.has('acmm:agents-md')).toBe(true)
    expect(AGENT_INSTRUCTION_FILE_IDS.has('acmm:cursor-rules')).toBe(true)
  })
})
