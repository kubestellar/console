import { useReducer, useEffect, useMemo } from 'react'
import { Shield, Loader2 } from 'lucide-react'
import { useCanI } from '../../hooks/usePermissions'
import { useClusters, useNamespaces } from '../../hooks/useMCP'
import { Button } from '../ui/Button'
import { useTranslation } from 'react-i18next'
import { PageErrorBoundary } from '../PageErrorBoundary'
import { getDefaultClusterSelection } from '../../lib/clusterSelection'
import {
  COMMON_VERBS,
  COMMON_RESOURCES,
  COMMON_API_GROUPS,
  RESOURCE_API_GROUPS,
} from './CanIChecker.constants'
import { formReducer, INITIAL_FORM_STATE } from './CanIChecker.state'
import {
  LabeledSelect,
  CustomValueInput,
  UserGroupsField,
  AdvancedApiGroupsHelp,
  CanIResultPanel,
  CanIErrorPanel,
  NoClustersWarning,
} from './CanIChecker.parts'

function CanICheckerContent() {
  const { t } = useTranslation('common')
  const { deduplicatedClusters: rawClusters } = useClusters()
  const clusters = useMemo(() => rawClusters.map(c => c.name), [rawClusters])
  const { checkPermission, checking, result, error, reset } = useCanI()

  const [form, dispatch] = useReducer(formReducer, INITIAL_FORM_STATE)
  const {
    cluster, verb, resource, namespace,
    customVerb, customResource, apiGroup, customApiGroup,
    selectedUserGroups, customUserGroup, showAdvanced, checkedSnapshot,
  } = form

  const setField = (field: keyof typeof form, value: (typeof form)[keyof typeof form]) => {
    dispatch({ type: 'SET_FIELD', field, value })
  }

  const defaultCluster = useMemo(() => getDefaultClusterSelection(rawClusters), [rawClusters])

  useEffect(() => {
    if (!cluster && defaultCluster) {
      dispatch({ type: 'SET_FIELD', field: 'cluster', value: defaultCluster })
    }
  }, [cluster, defaultCluster])

  // Get selected cluster for namespace fetching
  const selectedCluster = cluster
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
    const targetCluster = cluster
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
        <LabeledSelect
          id="cluster-select"
          label={t('rbac.cluster')}
          value={cluster}
          onChange={(value) => setField('cluster', value)}
          testId="can-i-cluster"
        >
          {clusters.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </LabeledSelect>

        {/* Verb Selection */}
        <div>
          <LabeledSelect
            id="verb-select"
            label={t('rbac.actionVerb')}
            value={verb}
            onChange={(value) => setField('verb', value)}
            testId="can-i-verb"
          >
            {COMMON_VERBS.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
            <option value="custom">{t('rbac.custom')}</option>
          </LabeledSelect>
          {verb === 'custom' && (
            <CustomValueInput
              value={customVerb}
              onChange={(value) => setField('customVerb', value)}
              placeholder={t('rbac.enterCustomVerb')}
              testId="can-i-custom-verb"
            />
          )}
        </div>

        {/* Resource Selection */}
        <div>
          <LabeledSelect
            id="resource-select"
            label={t('rbac.resource')}
            value={resource}
            onChange={(value) => setField('resource', value)}
            testId="can-i-resource"
          >
            {COMMON_RESOURCES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
            <option value="custom">{t('rbac.custom')}</option>
          </LabeledSelect>
          {resource === 'custom' && (
            <CustomValueInput
              value={customResource}
              onChange={(value) => setField('customResource', value)}
              placeholder={t('rbac.enterCustomResource')}
              testId="can-i-custom-resource"
            />
          )}
        </div>

        {/* Namespace (optional) */}
        <div>
          <LabeledSelect
            id="namespace-select"
            label={<>{t('rbac.namespace')} <span className="text-muted-foreground">{t('rbac.namespaceHint')}</span></>}
            value={namespace}
            onChange={(value) => setField('namespace', value)}
            testId="can-i-namespace"
          >
            <option value="">{t('rbac.allNamespacesClusterScoped')}</option>
            {availableNamespaces.map((ns) => (
              <option key={ns} value={ns}>{ns}</option>
            ))}
          </LabeledSelect>
          {availableNamespaces.length === 0 && selectedCluster && (
            <p className="mt-1 text-xs text-muted-foreground">{t('rbac.loadingNamespaces')}</p>
          )}
        </div>

        {/* API Group - dropdown with common groups */}
        <div>
          <LabeledSelect
            id="api-group-select"
            label={<>{t('rbac.apiGroup')} <span className="text-muted-foreground">{t('rbac.apiGroupHint')}</span></>}
            value={apiGroup}
            onChange={(value) => setField('apiGroup', value)}
            testId="can-i-api-group"
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
          </LabeledSelect>
          {apiGroup === 'custom' && (
            <CustomValueInput
              value={customApiGroup}
              onChange={(value) => setField('customApiGroup', value)}
              placeholder={t('rbac.enterCustomApiGroup')}
              testId="can-i-custom-api-group"
            />
          )}
        </div>

        {/* User Groups - multi-select for OpenShift and RBAC */}
        <UserGroupsField
          selectedUserGroups={selectedUserGroups}
          customUserGroup={customUserGroup}
          onToggleGroup={toggleUserGroup}
          onCustomGroupChange={(value) => setField('customUserGroup', value)}
          onAddCustomGroup={addCustomUserGroup}
        />

        {/* Advanced Options */}
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => setField('showAdvanced', !showAdvanced)}
          className="text-sm text-muted-foreground hover:text-foreground"
          aria-expanded={showAdvanced}
        >
          {showAdvanced ? t('rbac.hideAdvanced') : t('rbac.showAdvanced')}
        </Button>

        {showAdvanced && <AdvancedApiGroupsHelp />}

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
            aria-label={checking ? t('rbac.checking') : t('rbac.checkPermission')}
          >
            {checking ? t('rbac.checking') : t('rbac.checkPermission')}
          </Button>
          {(result || error) && (
            <Button
              variant="secondary"
              size="lg"
              onClick={handleReset}
              data-testid="can-i-reset"
              aria-label={t('rbac.reset')}
            >
              {t('rbac.reset')}
            </Button>
          )}
        </div>

        {result && checkedSnapshot && (
          <CanIResultPanel result={result} snapshot={checkedSnapshot} />
        )}

        {error && <CanIErrorPanel error={error} />}

        {clusters.length === 0 && <NoClustersWarning />}
      </div>
    </div>
  )
}

export function CanIChecker() {
  return (
    <PageErrorBoundary>
      <CanICheckerContent />
    </PageErrorBoundary>
  )
}
