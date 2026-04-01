import { describe, it, expect } from 'vitest'
import { extractJsonFromMarkdown } from '../extractJson'

describe('extractJsonFromMarkdown', () => {
  it('parses plain JSON', () => {
    const result = extractJsonFromMarkdown('{"key":"value"}')
    expect(result.data).toEqual({ key: 'value' })
    expect(result.error).toBeNull()
  })

  it('parses JSON array', () => {
    const result = extractJsonFromMarkdown('[1, 2, 3]')
    expect(result.data).toEqual([1, 2, 3])
    expect(result.error).toBeNull()
  })

  it('extracts from ```json fenced block', () => {
    const text = 'Here is the result:\n```json\n{"name":"test"}\n```\nDone.'
    const result = extractJsonFromMarkdown(text)
    expect(result.data).toEqual({ name: 'test' })
  })

  it('extracts from ``` fenced block (no language)', () => {
    const text = 'Output:\n```\n{"items":[1,2]}\n```'
    const result = extractJsonFromMarkdown(text)
    expect(result.data).toEqual({ items: [1, 2] })
  })

  it('handles trailing commas', () => {
    const text = '{"a":1,"b":2,}'
    const result = extractJsonFromMarkdown(text)
    expect(result.data).toEqual({ a: 1, b: 2 })
  })

  it('handles trailing comma in array', () => {
    const text = '[1, 2, 3,]'
    const result = extractJsonFromMarkdown(text)
    expect(result.data).toEqual([1, 2, 3])
  })

  it('finds JSON object in surrounding prose', () => {
    const text = 'The configuration is {"port":8080,"host":"localhost"} which you should use.'
    const result = extractJsonFromMarkdown(text)
    expect(result.data).toEqual({ port: 8080, host: 'localhost' })
  })

  it('returns error for empty text', () => {
    const result = extractJsonFromMarkdown('')
    expect(result.data).toBeNull()
    expect(result.error).toBeTruthy()
  })

  it('returns error for whitespace-only text', () => {
    const result = extractJsonFromMarkdown('   \n  ')
    expect(result.data).toBeNull()
    expect(result.error).toBeTruthy()
  })

  it('returns error for non-JSON text', () => {
    const result = extractJsonFromMarkdown('This is just plain text with no JSON.')
    expect(result.data).toBeNull()
    expect(result.error).toBeTruthy()
  })

  it('handles nested JSON objects', () => {
    const text = '{"outer":{"inner":{"deep":"value"}}}'
    const result = extractJsonFromMarkdown(text)
    expect(result.data).toEqual({ outer: { inner: { deep: 'value' } } })
  })

  it('handles strings with braces inside', () => {
    const text = '{"template":"{hello}"}'
    const result = extractJsonFromMarkdown(text)
    expect(result.data).toEqual({ template: '{hello}' })
  })

  it('handles escaped quotes in strings', () => {
    const text = '{"msg":"He said \\"hello\\""}'
    const result = extractJsonFromMarkdown(text)
    expect(result.data).toEqual({ msg: 'He said "hello"' })
  })

  it('prefers last fenced block', () => {
    const text = '```json\n{"old":true}\n```\nUpdated:\n```json\n{"new":true}\n```'
    const result = extractJsonFromMarkdown(text)
    expect(result.data).toEqual({ new: true })
  })
})
