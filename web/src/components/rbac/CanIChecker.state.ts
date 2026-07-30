/**
 * Snapshot of the inputs that were used for the most recent Check call.
 * Rendered in the result banner so the banner text stays stable even if the
 * user edits the verb/resource dropdowns after the result arrives
 * (Issue 9268).
 */
export interface CheckedSnapshot {
  verb: string
  resource: string
  namespace: string | undefined
}

/** Form state managed by useReducer to batch updates (e.g. handleReset)
 *  and prevent intermediate re-renders / UI flicker. */
export interface FormState {
  cluster: string
  verb: string
  resource: string
  namespace: string
  customVerb: string
  customResource: string
  apiGroup: string
  customApiGroup: string
  selectedUserGroups: string[]
  customUserGroup: string
  showAdvanced: boolean
  checkedSnapshot: CheckedSnapshot | null
}

export const INITIAL_FORM_STATE: FormState = {
  cluster: '',
  verb: 'get',
  resource: 'pods',
  namespace: '',
  customVerb: '',
  customResource: '',
  apiGroup: '',
  customApiGroup: '',
  selectedUserGroups: [],
  customUserGroup: '',
  showAdvanced: false,
  checkedSnapshot: null,
}

export type FormAction =
  | { type: 'SET_FIELD'; field: keyof FormState; value: FormState[keyof FormState] }
  | { type: 'TOGGLE_USER_GROUP'; group: string }
  | { type: 'ADD_CUSTOM_USER_GROUP' }
  | { type: 'RESET' }

export function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value }
    case 'TOGGLE_USER_GROUP': {
      const groups = state.selectedUserGroups.includes(action.group)
        ? state.selectedUserGroups.filter(g => g !== action.group)
        : [...state.selectedUserGroups, action.group]
      return { ...state, selectedUserGroups: groups }
    }
    case 'ADD_CUSTOM_USER_GROUP': {
      const trimmed = state.customUserGroup.trim()
      if (!trimmed || state.selectedUserGroups.includes(trimmed)) return state
      return {
        ...state,
        selectedUserGroups: [...state.selectedUserGroups, trimmed],
        customUserGroup: '',
      }
    }
    case 'RESET':
      return INITIAL_FORM_STATE
    default:
      return state
  }
}
