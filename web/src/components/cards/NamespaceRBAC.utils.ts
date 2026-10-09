export interface NamespaceRBACProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

export interface RBACItem {
  name: string
  type: 'Role' | 'RoleBinding' | 'ServiceAccount'
  subjects?: string[]
  rules?: number
  cluster?: string
}

export type SortByOption = 'name' | 'rules'
export type SortTranslationKey = 'common:common.name' | 'cards:namespaceRBAC.rules'

export const SORT_OPTIONS_KEYS: ReadonlyArray<{ value: SortByOption; labelKey: SortTranslationKey }> = [
  { value: 'name' as const, labelKey: 'common:common.name' },
  { value: 'rules' as const, labelKey: 'cards:namespaceRBAC.rules' },
]

/**
 * Tab keys that expose a meaningful rule count. ServiceAccounts don't have
 * rules, so "Sort by Rules" is hidden on the ServiceAccounts tab
 * (Issue 9268).
 */
export const TABS_WITH_RULES_COUNT: ReadonlyArray<'roles' | 'bindings' | 'serviceaccounts'> = ['roles']
