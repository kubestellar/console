import { describe, it, expect } from 'vitest'
import {
  CARD_T1_SYSTEM_PROMPT,
  CARD_T2_SYSTEM_PROMPT,
  CARD_INLINE_ASSIST_PROMPT,
  CODE_INLINE_ASSIST_PROMPT,
  STAT_INLINE_ASSIST_PROMPT,
  STAT_BLOCK_SYSTEM_PROMPT,
} from '../prompts'

describe('ai/prompts', () => {
  describe('CARD_T1_SYSTEM_PROMPT', () => {
    it('is a non-empty string', () => {
      expect(typeof CARD_T1_SYSTEM_PROMPT).toBe('string')
      expect(CARD_T1_SYSTEM_PROMPT.length).toBeGreaterThan(100)
    })

    it('mentions JSON schema fields', () => {
      expect(CARD_T1_SYSTEM_PROMPT).toContain('title')
      expect(CARD_T1_SYSTEM_PROMPT).toContain('columns')
      expect(CARD_T1_SYSTEM_PROMPT).toContain('staticData')
    })

    it('mentions badge color format', () => {
      expect(CARD_T1_SYSTEM_PROMPT).toContain('bg-')
      expect(CARD_T1_SYSTEM_PROMPT).toContain('text-')
    })

    it('instructs to return JSON in a code fence', () => {
      expect(CARD_T1_SYSTEM_PROMPT).toContain('```json')
    })

    it('includes layout options', () => {
      expect(CARD_T1_SYSTEM_PROMPT).toContain('list')
      expect(CARD_T1_SYSTEM_PROMPT).toContain('stats')
    })
  })

  describe('CARD_T2_SYSTEM_PROMPT', () => {
    it('is a non-empty string', () => {
      expect(typeof CARD_T2_SYSTEM_PROMPT).toBe('string')
      expect(CARD_T2_SYSTEM_PROMPT.length).toBeGreaterThan(100)
    })

    it('mentions React component export pattern', () => {
      expect(CARD_T2_SYSTEM_PROMPT).toContain('export default function')
    })

    it('mentions Tailwind CSS', () => {
      expect(CARD_T2_SYSTEM_PROMPT).toContain('Tailwind CSS')
    })

    it('mentions available scope items', () => {
      expect(CARD_T2_SYSTEM_PROMPT).toContain('useState')
      expect(CARD_T2_SYSTEM_PROMPT).toContain('useEffect')
      expect(CARD_T2_SYSTEM_PROMPT).toContain('cn')
    })

    it('instructs not to use import statements', () => {
      expect(CARD_T2_SYSTEM_PROMPT).toContain('DO NOT import')
    })
  })

  describe('CARD_INLINE_ASSIST_PROMPT', () => {
    it('is a non-empty string', () => {
      expect(CARD_INLINE_ASSIST_PROMPT.length).toBeGreaterThan(50)
    })

    it('mentions column schema', () => {
      expect(CARD_INLINE_ASSIST_PROMPT).toContain('field')
      expect(CARD_INLINE_ASSIST_PROMPT).toContain('label')
    })
  })

  describe('CODE_INLINE_ASSIST_PROMPT', () => {
    it('is a non-empty string', () => {
      expect(CODE_INLINE_ASSIST_PROMPT.length).toBeGreaterThan(50)
    })

    it('mentions sourceCode in response format', () => {
      expect(CODE_INLINE_ASSIST_PROMPT).toContain('sourceCode')
    })
  })

  describe('STAT_INLINE_ASSIST_PROMPT', () => {
    it('is a non-empty string', () => {
      expect(STAT_INLINE_ASSIST_PROMPT.length).toBeGreaterThan(50)
    })

    it('mentions stat block fields', () => {
      expect(STAT_INLINE_ASSIST_PROMPT).toContain('label')
      expect(STAT_INLINE_ASSIST_PROMPT).toContain('icon')
      expect(STAT_INLINE_ASSIST_PROMPT).toContain('color')
    })
  })

  describe('STAT_BLOCK_SYSTEM_PROMPT', () => {
    it('is a non-empty string', () => {
      expect(STAT_BLOCK_SYSTEM_PROMPT.length).toBeGreaterThan(100)
    })

    it('lists available colors', () => {
      expect(STAT_BLOCK_SYSTEM_PROMPT).toContain('purple')
      expect(STAT_BLOCK_SYSTEM_PROMPT).toContain('green')
      expect(STAT_BLOCK_SYSTEM_PROMPT).toContain('red')
    })

    it('lists format options', () => {
      expect(STAT_BLOCK_SYSTEM_PROMPT).toContain('number')
      expect(STAT_BLOCK_SYSTEM_PROMPT).toContain('percent')
      expect(STAT_BLOCK_SYSTEM_PROMPT).toContain('bytes')
    })

    it('includes an example JSON block', () => {
      expect(STAT_BLOCK_SYSTEM_PROMPT).toContain('```json')
      expect(STAT_BLOCK_SYSTEM_PROMPT).toContain('Cluster Overview')
    })
  })
})
