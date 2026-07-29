import { describe, expect, it } from 'vitest'

import { extractCodeBlocks } from '../MissionDetailView.helpers'

describe('extractCodeBlocks', () => {
  it('returns a single "before" block with the full text when there are no code fences', () => {
    const text = 'This is a plain paragraph with no code.'
    expect(extractCodeBlocks(text)).toEqual([{ before: text, code: '', after: '' }])
  })

  it('extracts a single fenced code block and preserves surrounding text', () => {
    const text = 'Before code\n```\nkubectl get pods\n```\nAfter code'
    const parts = extractCodeBlocks(text)
    expect(parts).toHaveLength(1)
    expect(parts[0].before).toBe('Before code')
    expect(parts[0].code).toBe('kubectl get pods')
    expect(parts[0].after).toBe('After code')
  })

  it('supports language tags on the opening fence', () => {
    const text = 'Try this:\n```bash\nkubectl apply -f x.yaml\n```\n'
    const parts = extractCodeBlocks(text)
    expect(parts[0].code).toBe('kubectl apply -f x.yaml')
  })

  it('extracts multiple sequential code blocks with per-block "before" and only the last block gets "after"', () => {
    const text = 'Intro\n```\nfirst\n```\nMiddle\n```\nsecond\n```\nTail text'
    const parts = extractCodeBlocks(text)
    expect(parts).toHaveLength(2)
    expect(parts[0]).toEqual({ before: 'Intro', code: 'first', after: '' })
    expect(parts[1].before).toBe('Middle')
    expect(parts[1].code).toBe('second')
    expect(parts[1].after).toBe('Tail text')
  })

  it('trims surrounding whitespace on before/code/after', () => {
    const text = '  intro  \n```\n  cmd  \n```\n  outro  '
    const parts = extractCodeBlocks(text)
    expect(parts[0].before).toBe('intro')
    expect(parts[0].code).toBe('cmd')
    expect(parts[0].after).toBe('outro')
  })

  it('handles a code block at the very start of the text (empty before)', () => {
    const text = '```\nhello\n```'
    const parts = extractCodeBlocks(text)
    expect(parts[0].before).toBe('')
    expect(parts[0].code).toBe('hello')
    expect(parts[0].after).toBe('')
  })

  it('emits empty "after" when the text ends with the closing fence', () => {
    const text = 'x\n```\ncmd\n```'
    const parts = extractCodeBlocks(text)
    expect(parts[0].after).toBe('')
  })

  it('handles empty string input', () => {
    expect(extractCodeBlocks('')).toEqual([{ before: '', code: '', after: '' }])
  })

  it('handles an empty fenced block (no body)', () => {
    const text = '```\n```'
    const parts = extractCodeBlocks(text)
    expect(parts[0].code).toBe('')
  })
})
