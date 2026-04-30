import { useReducer } from 'react'
import { Shield, Check, X, Loader2, AlertCircle, ChevronDown } from 'lucide-react'
import { useCanI } from '../../hooks/usePermissions'
import { useClusters, useNamespaces } from '../../hooks/useMCP'
import { Button } from '../ui/Button'
import { useTranslation } from 'react-i18next'

const COMMON_VERBS = ['get', 'list', 'create', 'update', 'delete', 'watch', 'patch']

// Common API groups for Kubernetes resources
const COMMON_API_GROUPS = [
  { value: '', label: 'Core API (pods, services, secrets)' },
  { value: 'apps', label: 'apps (deployments, statefulsets)' },
  { value: 'rbac.authorization.k8s.io', label: 'rbac.authorization.k8s.io (roles, bindings)' },
  { value: 'batch', label: 'batch (jobs, cronjobs)' },
  { value: 'networking.k8s.io', label: 'networking.k8s.io (ingresses)' },
  { value: 'autoscaling', label: 'autoscaling (hpa)' },
  { value: 'storage.k8s.io', label: 'storage.k8s.io (storageclasses)' },
  { value: 'policy', label: 'policy (poddisruptionbudgets)' },
  { value: 'admissionregistration.k8s.io', label: 'admissionregistration.k8s.io (webhooks)' },
  { value: 'apiextensions.k8s.io', label: 'apiextensions.k8s.io (crds)' },
]

// Common user groups, especially for OpenShift
const COMMON_USER_GROUPS = [
  { value: 'system:authenticated', label: 'system:authenticated' },
  { value: 'system:authenticated:oauth', label: 'system:authenticated:oauth (OpenShift)' },
  { value: 'system:cluster-admins', label: 'system:cluster-admins' },
  { value: 'cluster-admins', label: 'cluster-admins (OpenShift)' },
  { value: 'dedicated-admins', label: 'dedicated-admins (OpenShift Dedicated)' },
  { value: 'system:serviceaccounts', label: 'system:serviceaccounts' },
  { value: 'system:masters', label: 'system:masters' },
]

// Resource to API group mapping - required for correct permission checks
const RESOURCE_API_GROUPS: Record<string, string> = {
  // Core API (empty string)
  pods: '',
  services: '',
  secrets: '',
  configmaps: '',
  namespaces: '',
  nodes: '',
  persistentvolumeclaims: '',
  serviceaccounts: '',
  events: '',
  endpoints: '',
  // apps API group
  deployments: 'apps',
  replicasets: 'apps',
  statefulsets: 'apps',
  daemonsets: 'apps',
  // rbac.authorization.k8s.io
  roles: 'rbac.authorization.k8s.io',
  rolebindings: 'rbac.authorization.k8s.io',
  clusterroles: 'rbac.authorization.k8s.io',
  clusterrolebindings: 'rbac.authorization.k8s.io',
  // batch
  jobs: 'batch',
  cronjobs: 'batch',
  // networking.k8s.io
  ingresses: 'networking.k8s.io',
  networkpolicies: 'networking.k8s.io',
  // autoscaling
  horizontalpodautoscalers: 'autoscaling',
  // storage.k8s.io
  storageclasses: 'storage.k8s.io' }

const COMMON_RESOURCES = [
  'pods',
  'deployments',
  'services',
  'secrets',
  'configmaps',
  'namespaces',
  'nodes',
  'persistentvolumeclaims',
  'serviceaccounts',
  'roles',
  'rolebindings',
  'clusterroles',
  'clusterrolebindings',
  'jobs',
  'cronjobs',
  'ingresses',
  'statefulsets',
  'daemonsets',
]

/**
 * Snapshot of the inputs that were used for the most recent Check call.
 * Rendered in the result banner so the banner text stays stable even if the
 * user edits the verb/resource dropdowns after the result arrives
 * (Issue 9268).
 */
interface CheckedSnapshot {
  verb: string
  resource: string
  namespace: string | undefined
}

/** Form state managed by useReducer to batch updates (e.g. handleReset)
 *  and prevent intermediate re-renders / UI flicker. */
interface FormState {
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

const INITIAL_FORM_STATE: FormState = {
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

type FormAction =
  | { type: 'SET_FIELD'; field: keyof FormState; value: FormState[keyof FormState] }
  | { type: 'TOGGLE_USER_GROUP'; group: string }
  | { type: 'ADD_CUSTOM_USER_GROUP' }
  | { type: 'RESET' }

function formReducer(state: FormState, action: FormAction): FormState {
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

export function CanIChecker() {
  const { t } = useTranslation('common')
  const { deduplicatedClusters: rawClusters } = useClusters()
  const clusters = rawClusters.map(c => c.name)
  const { checkPermission, checking, result, error, reset } = useCanI()

  const [form, dispatch] = useReducer(formReducer, INITIAL_FORM_STATE)
  const {
    cluster, verb, resource, namespace,
    customVerb, customResource, apiGroup, customApiGroup,
    selectedUserGroups, customUserGroup, showAdvanced, checkedSnapshot,
  } = form

  // Get selected cluster for namespace fetching
  const selectedCluster = cluster || clusters[0] || ''
  const { namespaces } = useNamespaces(selectedCluster)

  // Available namespaces for dropdown
  const availableNamespaces = namespaces || []

  // Toggle user group selection
  const toggleUserGroup = (group: string) => {
    dispatch({ type: 'TOGGLE_USER_GROUP', group })
  }

  // Add custom user group
  const addCustomUserGroup = () => {
    dispatch({ type: 'ADD_CUSTOM_USER_GROUP' })
  }

  const handleCheck = async () => {
    const targetCluster = cluster || clusters[0]
    if (!targetCluster) return

    const selectedVerb = verb === 'custom' ? customVerb : verb
    const selectedResource = resource === 'custom' ? customResource : resource

    if (!selectedVerb || !selectedResource) return

    // Determine effective API group
    const effectiveApiGroup = apiGroup === 'custom'
      ? customApiGroup
      : apiGroup || RESOURCE_API_GROUPS[selectedResource]

    // User groups for permission check
    const groups = selectedUserGroups.length > 0 ? selectedUserGroups : undefined

    // Issue 9268: freeze the values used for this check so the result banner
    // text stays stable if the user edits the dropdowns after the result
    // arrives. Snapshot is set *before* the async call so a late-arriving
    // result doesn't render with pre-snapshot dropdown state.
    dispatch({
      type: 'SET_FIELD',
      field: 'checkedSnapshot',
      value: {
        verb: selectedVerb,
        resource: selectedResource,
        namespace: namespace || undefined,
      },
    })

    await checkPermission({
      cluster: targetCluster,
      verb: selectedVerb,
      resource: selectedResource,
      namespace: namespace || undefined,
      group: effectiveApiGroup !== undefined ? effectiveApiGroup : undefined,
      groups })
  }

  const handleReset = () => {
    reset()
    dispatch({ type: 'RESET' })
  }

  return (
    <div className="glass rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-blue-500/20">
          <Shield className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h2 className="text-lg font-medium text-foreground">{t('rbac.permissionChecker')}</h2>
          <p className="text-sm text-muted-foreground">{t('rbac.permissionCheckerDesc')}</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Cluster Selection */}
        <div>
          <label htmlFor="cluster-select" className="block text-sm font-medium text-foreground mb-1">
            {t('rbac.cluster')}
          </label>
          <div className="relative">
            <select
              id="cluster-select"
              value={cluster || clusters[0] || ''}
              onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'cluster', value: e.target.value })}
              className="w-full p-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-hidden focus:ring-2 focus:ring-blue-500 appearance-none pr-8"
              data-testid="can-i-cluster"
            >
              {clusters.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Verb Selection */}
        <div>
          <label htmlFor="verb-select" className="block text-sm font-medium text-foreground mb-1">
            {t('rbac.actionVerb')}
          </label>
          <div className="relative">
            <select
              id="verb-select"
              value={verb}
              onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'verb', value: e.target.value })}
              className="w-full p-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-hidden focus:ring-2 focus:ring-blue-500 appearance-none pr-8"
              data-testid="can-i-verb"
            >
              {COMMON_VERBS.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
              <option value="custom">{t('rbac.custom')}</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
          {verb === 'custom' && (
            <input
              type="text"
              value={customVerb}
              onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'customVerb', value: e.target.value })}
              placeholder={t('rbac.enterCustomVerb')}
              className="mt-2 w-full p-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              data-testid="can-i-custom-verb"
            />
          )}
        </div>

        {/* Resource Selection */}
        <div>
          <label htmlFor="resource-select" className="block text-sm font-medium text-foreground mb-1">
            {t('rbac.resource')}
          </label>
          <div className="relative">
            <select
              id="resource-select"
              value={resource}
              onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'resource', value: e.target.value })}
              className="w-full p-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-hidden focus:ring-2 focus:ring-blue-500 appearance-none pr-8"
              data-testid="can-i-resource"
            >
              {COMMON_RESOURCES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
              <option value="custom">{t('rbac.custom')}</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
          {resource === 'custom' && (
            <input
              type="text"
              value={customResource}
              onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'customResource', value: e.target.value })}
              placeholder={t('rbac.enterCustomResource')}
              className="mt-2 w-full p-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              data-testid="can-i-custom-resource"
            />
          )}
        </div>

        {/* Namespace (optional) */}
        <div>
          <label htmlFor="namespace-select" className="block text-sm font-medium text-foreground mb-1">
            {t('rbac.namespace')} <span className="text-muted-foreground">{t('rbac.namespaceHint')}</span>
          </label>
          <div className="relative">
            <select
              id="namespace-select"
              value={namespace}
              onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'namespace', value: e.target.value })}
              className="w-full p-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-hidden focus:ring-2 focus:ring-blue-500 appearance-none pr-8"
              data-testid="can-i-namespace"
            >
              <option value="">{t('rbac.allNamespacesClusterScoped')}</option>
              {availableNamespaces.map((ns) => (
                <option key={ns} value={ns}>{ns}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
          {availableNamespaces.length === 0 && selectedCluster && (
            <p className="mt-1 text-xs text-muted-foreground">{t('rbac.loadingNamespaces')}</p>
          )}
        </div>

        {/* API Group - dropdown with common groups */}
        <div>
          <label htmlFor="api-group-select" className="block text-sm font-medium text-foreground mb-1">
            {t('rbac.apiGroup')} <span className="text-muted-foreground">{t('rbac.apiGroupHint')}</span>
          </label>
          <div className="relative">
            <select
              id="api-group-select"
              value={apiGroup}
              onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'apiGroup', value: e.target.value })}
              className="w-full p-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-hidden focus:ring-2 focus:ring-blue-500 appearance-none pr-8"
              data-testid="can-i-api-group"
            >
              <option value="">
                {resource !== 'custom' && RESOURCE_API_GROUPS[resource] !== undefined
                  ? `${t('rbac.autoDetect')}: ${RESOURCE_API_GROUPS[resource] || t('rbac.coreAPI')}`
                  : t('rbac.autoDetectFromResource')
                }
              </option>
              {COMMON_API_GROUPS.map((group) => (
                <option key={group.value || 'core'} value={group.value}>{group.label}</option>
              ))}
              <option value="custom">{t('rbac.custom')}</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
          {apiGroup === 'custom' && (
            <input
              type="text"
              value={customApiGroup}
              onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'customApiGroup', value: e.target.value })}
              placeholder={t('rbac.enterCustomApiGroup')}
              className="mt-2 w-full p-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              data-testid="can-i-custom-api-group"
            />
          )}
        </div>

        {/* User Groups - multi-select dropdown for OpenShift and RBAC */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            {t('rbac.userGroups')} <span className="text-muted-foreground">{t('rbac.userGroupsHint')}</span>
          </label>

          {/* Selected groups display */}
          {selectedUserGroups.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {selectedUserGroups.map((group) => (
                <span
                  key={group}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-blue-500/20 text-blue-400"
                >
                  {group}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleUserGroup(group)}
                    className="p-0 hover:text-blue-200"
                    aria-label={t('rbac.removeGroup', { group })}
                    icon={<X className="w-3 h-3" />}
                  />
                </span>
              ))}
            </div>
          )}

          {/* Common groups dropdown */}
          <div className="relative">
            <select
              value=""
              onChange={(e) => {
                if (e.target.value && !selectedUserGroups.includes(e.target.value)) {
                  toggleUserGroup(e.target.value)
                }
              }}
              className="w-full p-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-hidden focus:ring-2 focus:ring-blue-500 appearance-none pr-8"
              data-testid="can-i-user-groups"
            >
              <option value="">{t('rbac.selectCommonGroups')}</option>
              {COMMON_USER_GROUPS.filter(g => !selectedUserGroups.includes(g.value)).map((group) => (
                <option key={group.value} value={group.value}>{group.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>

          {/* Custom group input */}
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={customUserGroup}
              onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'customUserGroup', value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addCustomUserGroup()
                }
              }}
              placeholder={t('rbac.addCustomGroupPlaceholder')}
              className="flex-1 p-2 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
            <Button
              variant="primary"
              size="lg"
              onClick={addCustomUserGroup}
              disabled={!customUserGroup.trim()}
            >
              {t('rbac.add')}
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('rbac.addGroupsDesc')}
          </p>
        </div>

        {/* Advanced Options */}
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => dispatch({ type: 'SET_FIELD', field: 'showAdvanced', value: !showAdvanced })}
          className="text-sm text-muted-foreground hover:text-foreground"
          aria-expanded={showAdvanced}
        >
          {showAdvanced ? t('rbac.hideAdvanced') : t('rbac.showAdvanced')}
        </Button>

        {showAdvanced && (
          <div className="text-xs text-muted-foreground p-3 bg-secondary/30 rounded-lg">
            <p className="font-medium mb-2">{t('rbac.commonApiGroupsTitle')}</p>
            <ul className="space-y-1">
              <li><code className="text-blue-400">""</code> - {t('rbac.apiGroupCoreDesc')}</li>
              <li><code className="text-blue-400">apps</code> - {t('rbac.apiGroupAppsDesc')}</li>
              <li><code className="text-blue-400">rbac.authorization.k8s.io</code> - {t('rbac.apiGroupRbacDesc')}</li>
              <li><code className="text-blue-400">batch</code> - {t('rbac.apiGroupBatchDesc')}</li>
              <li><code className="text-blue-400">networking.k8s.io</code> - {t('rbac.apiGroupNetworkingDesc')}</li>
            </ul>
          </div>
        )}

        {/* Check Button */}
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="lg"
            onClick={handleCheck}
            disabled={checking || clusters.length === 0}
            icon={checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            className="flex-1"
            data-testid="can-i-check"
          >
            {checking ? t('rbac.checking') : t('rbac.checkPermission')}
          </Button>
          {result && (
            <Button
              variant="secondary"
              size="lg"
              onClick={handleReset}
              data-testid="can-i-reset"
            >
              {t('rbac.reset')}
            </Button>
          )}
        </div>

        {/* Result — uses the frozen snapshot captured at Check time so the
            displayed verb/resource/namespace match what was actually checked
            (Issue 9268). */}
        {result && checkedSnapshot && (
          <div
            className={`p-4 rounded-lg border ${
              result.allowed
                ? 'bg-green-500/10 border-green-500/30'
                : 'bg-red-500/10 border-red-500/30'
            }`}
            data-testid="can-i-result"
          >
            <div className="flex items-center gap-2">
              {result.allowed ? (
                <>
                  <Check className="w-5 h-5 text-green-500" />
                  <span className="font-medium text-green-500">{t('rbac.allowed')}</span>
                </>
              ) : (
                <>
                  <X className="w-5 h-5 text-red-500" />
                  <span className="font-medium text-red-500">{t('rbac.denied')}</span>
                </>
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(result.allowed ? 'rbac.youCan' : 'rbac.youCannot')}{' '}
              <code className="px-1 py-0.5 rounded bg-secondary">{checkedSnapshot.verb}</code>{' '}
              <code className="px-1 py-0.5 rounded bg-secondary">{checkedSnapshot.resource}</code>
              {checkedSnapshot.namespace && (
                <>
                  {' '}{t('rbac.inNamespace')} <code className="px-1 py-0.5 rounded bg-secondary">{checkedSnapshot.namespace}</code>
                </>
              )}
            </p>
            {result.reason && (
              <p className="mt-1 text-xs text-muted-foreground">{result.reason}</p>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30" data-testid="can-i-error">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <span className="font-medium text-red-500">{t('common.error')}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
        )}

        {/* No clusters warning */}
        {clusters.length === 0 && (
          <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-500" />
              <span className="font-medium text-yellow-500">{t('rbac.noClustersAvailable')}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('rbac.connectToCluster')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
