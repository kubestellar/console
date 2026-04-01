import { describe, it, expect } from 'vitest'
import { cn } from '../cn'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'end')).toBe('base end')
  })

  it('handles undefined and null', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
  })

  it('merges Tailwind conflicts', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('handles empty arguments', () => {
    expect(cn()).toBe('')
  })

  it('handles arrays', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar')
  })

  it('resolves conflicting Tailwind padding on all sides', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })

  it('resolves conflicting Tailwind margin on all sides', () => {
    expect(cn('m-1', 'm-3')).toBe('m-3')
  })

  it('keeps non-conflicting Tailwind utilities', () => {
    expect(cn('px-2', 'py-4')).toBe('px-2 py-4')
  })

  it('resolves conflicting text color classes', () => {
    const result = cn('text-red-500', 'text-blue-500')
    expect(result).toBe('text-blue-500')
  })

  it('resolves conflicting background color classes', () => {
    const result = cn('bg-white', 'bg-gray-100')
    expect(result).toBe('bg-gray-100')
  })

  it('resolves conflicting font-size classes', () => {
    const result = cn('text-sm', 'text-lg')
    expect(result).toBe('text-lg')
  })

  it('handles deeply nested arrays', () => {
    expect(cn(['a', ['b', ['c']]])).toBe('a b c')
  })

  it('handles objects for conditional classes', () => {
    // hidden and block are both display utilities — twMerge keeps the last one
    expect(cn({ hidden: true, flex: false, block: true })).toBe('block')
  })

  it('merges objects with string classes', () => {
    expect(cn('base', { hidden: false, 'text-center': true })).toBe('base text-center')
  })

  it('handles mixed arrays and objects', () => {
    expect(cn(['foo'], { bar: true }, 'baz')).toBe('foo bar baz')
  })

  it('preserves duplicate non-Tailwind classes (twMerge only dedupes known utilities)', () => {
    const result = cn('foo', 'foo')
    // twMerge does not deduplicate unknown (non-Tailwind) class names
    expect(result).toBe('foo foo')
  })

  it('resolves conflicting display classes', () => {
    const result = cn('block', 'flex')
    expect(result).toBe('flex')
  })

  it('handles numeric zero as falsy (filtered by clsx)', () => {
    expect(cn('foo', 0 as unknown as string, 'bar')).toBe('foo bar')
  })

  it('handles empty string inputs', () => {
    expect(cn('', 'foo', '', 'bar', '')).toBe('foo bar')
  })

  it('resolves conflicting border-radius classes', () => {
    expect(cn('rounded', 'rounded-lg')).toBe('rounded-lg')
  })

  it('preserves arbitrary value classes', () => {
    expect(cn('w-[200px]', 'h-[100px]')).toBe('w-[200px] h-[100px]')
  })

  it('resolves conflicting arbitrary value classes of same property', () => {
    expect(cn('w-[200px]', 'w-[300px]')).toBe('w-[300px]')
  })
})
