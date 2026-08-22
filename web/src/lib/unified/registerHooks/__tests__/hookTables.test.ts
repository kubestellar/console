import { describe, it, expect } from 'vitest'
import { RESOURCE_HOOKS, CACHED_STATUS_HOOKS } from '../hookTables'

const VALID_ARITY = new Set(['none', 'cluster', 'cluster+namespace'])
const VALID_ERROR_MODES = new Set(['passthrough', 'isFailed', 'message'])
const HOOK_NAME_RE = /^use[A-Z][A-Za-z0-9]*$/

describe('RESOURCE_HOOKS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(RESOURCE_HOOKS)).toBe(true)
    expect(RESOURCE_HOOKS.length).toBeGreaterThan(0)
  })

  it('hook names are unique', () => {
    const names = RESOURCE_HOOKS.map(h => h.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('every entry has a well-formed hook name', () => {
    for (const { name } of RESOURCE_HOOKS) {
      expect(HOOK_NAME_RE.test(name), `${name} not a hook name`).toBe(true)
    }
  })

  it('every entry has a callable useHook function', () => {
    for (const { name, useHook } of RESOURCE_HOOKS) {
      expect(typeof useHook, `${name} useHook not function`).toBe('function')
    }
  })

  it('every entry has a non-empty dataField string', () => {
    for (const { name, dataField } of RESOURCE_HOOKS) {
      expect(typeof dataField).toBe('string')
      expect(dataField.length, `${name} empty dataField`).toBeGreaterThan(0)
    }
  })

  it('every entry has a valid arity value', () => {
    for (const { name, arity } of RESOURCE_HOOKS) {
      expect(VALID_ARITY.has(arity), `${name} bad arity ${arity}`).toBe(true)
    }
  })

  it('wrapRefetch, when set, is a boolean', () => {
    for (const { name, wrapRefetch } of RESOURCE_HOOKS) {
      if (wrapRefetch !== undefined) {
        expect(typeof wrapRefetch, `${name}`).toBe('boolean')
      }
    }
  })

  it('extra, when set, is a callable function', () => {
    for (const { name, extra } of RESOURCE_HOOKS) {
      if (extra !== undefined) {
        expect(typeof extra, `${name}`).toBe('function')
      }
    }
  })
})

describe('CACHED_STATUS_HOOKS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(CACHED_STATUS_HOOKS)).toBe(true)
    expect(CACHED_STATUS_HOOKS.length).toBeGreaterThan(0)
  })

  it('hook names are unique', () => {
    const names = CACHED_STATUS_HOOKS.map(h => h.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('every entry has a useCached* name convention', () => {
    for (const { name } of CACHED_STATUS_HOOKS) {
      expect(HOOK_NAME_RE.test(name), `${name} not a hook name`).toBe(true)
      expect(name.startsWith('useCached'), `${name} not useCached*`).toBe(true)
    }
  })

  it('every entry has a callable useCachedHook function', () => {
    for (const { name, useCachedHook } of CACHED_STATUS_HOOKS) {
      expect(typeof useCachedHook, `${name} useCachedHook not function`).toBe('function')
    }
  })

  it('every entry has non-empty dataField and loadingField strings', () => {
    for (const { name, dataField, loadingField } of CACHED_STATUS_HOOKS) {
      expect(typeof dataField).toBe('string')
      expect(dataField.length, `${name} empty dataField`).toBeGreaterThan(0)
      expect(typeof loadingField).toBe('string')
      expect(loadingField.length, `${name} empty loadingField`).toBeGreaterThan(0)
    }
  })

  it('errorMode is one of passthrough | isFailed | message', () => {
    for (const { name, errorMode } of CACHED_STATUS_HOOKS) {
      expect(VALID_ERROR_MODES.has(errorMode), `${name} bad errorMode ${errorMode}`).toBe(true)
    }
  })

  it('entries with errorMode "message" or "isFailed" carry an errorMsg', () => {
    for (const { name, errorMode, errorMsg } of CACHED_STATUS_HOOKS) {
      if (errorMode === 'message' || errorMode === 'isFailed') {
        expect(typeof errorMsg, `${name} needs errorMsg`).toBe('string')
        expect(errorMsg!.length, `${name} empty errorMsg`).toBeGreaterThan(0)
      }
    }
  })

  it('optional flags (optionalData, wrapRefetch), when set, are boolean', () => {
    for (const { name, optionalData, wrapRefetch } of CACHED_STATUS_HOOKS) {
      if (optionalData !== undefined) {
        expect(typeof optionalData, `${name}.optionalData`).toBe('boolean')
      }
      if (wrapRefetch !== undefined) {
        expect(typeof wrapRefetch, `${name}.wrapRefetch`).toBe('boolean')
      }
    }
  })

  it('refetchOverride, when set, is a callable factory', () => {
    for (const { name, refetchOverride } of CACHED_STATUS_HOOKS) {
      if (refetchOverride !== undefined) {
        expect(typeof refetchOverride, `${name}.refetchOverride`).toBe('function')
      }
    }
  })
})

describe('cross-table invariants', () => {
  it('RESOURCE_HOOKS and CACHED_STATUS_HOOKS name sets are disjoint', () => {
    const resource = new Set(RESOURCE_HOOKS.map(h => h.name))
    const cached = new Set(CACHED_STATUS_HOOKS.map(h => h.name))
    for (const n of cached) {
      expect(resource.has(n), `${n} appears in both tables`).toBe(false)
    }
  })
})
