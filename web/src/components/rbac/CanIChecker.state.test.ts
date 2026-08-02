import { describe, expect, it } from 'vitest'

import { formReducer, INITIAL_FORM_STATE, type FormState, type FormAction } from './CanIChecker.state'

// Small helper — start from a deep-cloned INITIAL_FORM_STATE so mutation bugs
// in the reducer surface as failures rather than as cross-test pollution.
const freshState = (): FormState => ({
  ...INITIAL_FORM_STATE,
  selectedUserGroups: [...INITIAL_FORM_STATE.selectedUserGroups],
})

describe('INITIAL_FORM_STATE', () => {
  it('defaults verb to "get" and resource to "pods"', () => {
    expect(INITIAL_FORM_STATE.verb).toBe('get')
    expect(INITIAL_FORM_STATE.resource).toBe('pods')
  })

  it('starts with no selected user groups', () => {
    expect(INITIAL_FORM_STATE.selectedUserGroups).toEqual([])
  })

  it('starts with checkedSnapshot === null (no result rendered yet)', () => {
    expect(INITIAL_FORM_STATE.checkedSnapshot).toBeNull()
  })

  it('starts with all custom / text fields empty', () => {
    expect(INITIAL_FORM_STATE.cluster).toBe('')
    expect(INITIAL_FORM_STATE.namespace).toBe('')
    expect(INITIAL_FORM_STATE.customVerb).toBe('')
    expect(INITIAL_FORM_STATE.customResource).toBe('')
    expect(INITIAL_FORM_STATE.apiGroup).toBe('')
    expect(INITIAL_FORM_STATE.customApiGroup).toBe('')
    expect(INITIAL_FORM_STATE.customUserGroup).toBe('')
    expect(INITIAL_FORM_STATE.showAdvanced).toBe(false)
  })
})

describe('formReducer / SET_FIELD', () => {
  it('sets a string field', () => {
    const next = formReducer(freshState(), { type: 'SET_FIELD', field: 'verb', value: 'create' })
    expect(next.verb).toBe('create')
  })

  it('sets a boolean field (showAdvanced)', () => {
    const next = formReducer(freshState(), { type: 'SET_FIELD', field: 'showAdvanced', value: true })
    expect(next.showAdvanced).toBe(true)
  })

  it('sets checkedSnapshot to a snapshot object', () => {
    const snapshot = { verb: 'get', resource: 'pods', namespace: 'default' }
    const next = formReducer(freshState(), { type: 'SET_FIELD', field: 'checkedSnapshot', value: snapshot })
    expect(next.checkedSnapshot).toBe(snapshot)
  })

  it('clears checkedSnapshot back to null', () => {
    const start = { ...freshState(), checkedSnapshot: { verb: 'get', resource: 'pods', namespace: undefined } }
    const next = formReducer(start, { type: 'SET_FIELD', field: 'checkedSnapshot', value: null })
    expect(next.checkedSnapshot).toBeNull()
  })

  it('does not mutate the previous state (immutability)', () => {
    const prev = freshState()
    const next = formReducer(prev, { type: 'SET_FIELD', field: 'verb', value: 'delete' })
    expect(prev.verb).toBe('get')
    expect(next).not.toBe(prev)
  })

  it('leaves all other fields untouched when setting a single field', () => {
    const prev = { ...freshState(), namespace: 'kube-system', showAdvanced: true }
    const next = formReducer(prev, { type: 'SET_FIELD', field: 'verb', value: 'list' })
    expect(next.namespace).toBe('kube-system')
    expect(next.showAdvanced).toBe(true)
    expect(next.resource).toBe('pods')
  })
})

describe('formReducer / TOGGLE_USER_GROUP', () => {
  it('adds a group that was not previously selected', () => {
    const next = formReducer(freshState(), { type: 'TOGGLE_USER_GROUP', group: 'system:masters' })
    expect(next.selectedUserGroups).toEqual(['system:masters'])
  })

  it('removes a group that was already selected', () => {
    const start = { ...freshState(), selectedUserGroups: ['system:masters', 'developers'] }
    const next = formReducer(start, { type: 'TOGGLE_USER_GROUP', group: 'system:masters' })
    expect(next.selectedUserGroups).toEqual(['developers'])
  })

  it('preserves ordering of remaining groups on removal', () => {
    const start = { ...freshState(), selectedUserGroups: ['a', 'b', 'c', 'd'] }
    const next = formReducer(start, { type: 'TOGGLE_USER_GROUP', group: 'c' })
    expect(next.selectedUserGroups).toEqual(['a', 'b', 'd'])
  })

  it('toggling the same group twice is a no-op (round-trip)', () => {
    const s1 = formReducer(freshState(), { type: 'TOGGLE_USER_GROUP', group: 'ops' })
    const s2 = formReducer(s1, { type: 'TOGGLE_USER_GROUP', group: 'ops' })
    expect(s2.selectedUserGroups).toEqual([])
  })

  it('does not mutate the previous selectedUserGroups array', () => {
    const start = { ...freshState(), selectedUserGroups: ['x'] }
    const originalRef = start.selectedUserGroups
    const next = formReducer(start, { type: 'TOGGLE_USER_GROUP', group: 'y' })
    expect(start.selectedUserGroups).toBe(originalRef)
    expect(start.selectedUserGroups).toEqual(['x'])
    expect(next.selectedUserGroups).not.toBe(originalRef)
  })
})

describe('formReducer / ADD_CUSTOM_USER_GROUP', () => {
  it('adds the trimmed customUserGroup and clears the input', () => {
    const start = { ...freshState(), customUserGroup: '  qa-team  ' }
    const next = formReducer(start, { type: 'ADD_CUSTOM_USER_GROUP' })
    expect(next.selectedUserGroups).toEqual(['qa-team'])
    expect(next.customUserGroup).toBe('')
  })

  it('does nothing when customUserGroup is empty', () => {
    const prev = freshState()
    const next = formReducer(prev, { type: 'ADD_CUSTOM_USER_GROUP' })
    expect(next).toBe(prev)
  })

  it('does nothing when customUserGroup is only whitespace', () => {
    const prev = { ...freshState(), customUserGroup: '   \t  ' }
    const next = formReducer(prev, { type: 'ADD_CUSTOM_USER_GROUP' })
    expect(next).toBe(prev)
  })

  it('does nothing when trimmed group is already in selectedUserGroups (no duplicates)', () => {
    const prev = { ...freshState(), customUserGroup: '  ops  ', selectedUserGroups: ['ops'] }
    const next = formReducer(prev, { type: 'ADD_CUSTOM_USER_GROUP' })
    expect(next).toBe(prev)
  })

  it('appends to an existing selectedUserGroups list without disturbing order', () => {
    const prev = { ...freshState(), customUserGroup: 'qa', selectedUserGroups: ['ops', 'dev'] }
    const next = formReducer(prev, { type: 'ADD_CUSTOM_USER_GROUP' })
    expect(next.selectedUserGroups).toEqual(['ops', 'dev', 'qa'])
    expect(next.customUserGroup).toBe('')
  })
})

describe('formReducer / RESET', () => {
  it('returns the shared INITIAL_FORM_STATE object', () => {
    const dirty: FormState = {
      cluster: 'prod',
      verb: 'delete',
      resource: 'secrets',
      namespace: 'kube-system',
      customVerb: 'x',
      customResource: 'y',
      apiGroup: 'apps',
      customApiGroup: 'z',
      selectedUserGroups: ['a', 'b'],
      customUserGroup: 'c',
      showAdvanced: true,
      checkedSnapshot: { verb: 'get', resource: 'pods', namespace: undefined },
    }
    const next = formReducer(dirty, { type: 'RESET' })
    expect(next).toBe(INITIAL_FORM_STATE)
  })
})

describe('formReducer / unknown action', () => {
  it('returns the same state reference for an unrecognized action type', () => {
    const prev = freshState()
    // Intentional cast: exercising the default branch of the switch.
    const next = formReducer(prev, { type: 'NOT_A_REAL_ACTION' } as unknown as FormAction)
    expect(next).toBe(prev)
  })
})
