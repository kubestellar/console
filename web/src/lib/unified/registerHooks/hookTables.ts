/**
 * Table-driven hook registration configuration.
 */

import type { CachedStatusHookConfig, ResourceHookConfig } from './factories'
import {
  useCachedPodIssues,
  useCachedEvents,
  useCachedDeployments,
  useCachedDeploymentIssues,
  useCachedHPAs,
  useCachedReplicaSets,
  useCachedStatefulSets,
  useCachedDaemonSets,
  useCachedCronJobs,
} from '../../../hooks/useCachedData'
import {
  useClusters,
  usePVCs,
  useServices,
  useOperators,
  useHelmReleases,
  useConfigMaps,
  useSecrets,
  useIngresses,
  useNodes,
  useJobs,
  useCronJobs,
  useStatefulSets,
  useDaemonSets,
  useHPAs,
  useReplicaSets,
  usePVs,
  useResourceQuotas,
  useLimitRanges,
  useNetworkPolicies,
  useNamespaces,
  useOperatorSubscriptions,
  useServiceAccounts,
  useK8sRoles,
  useK8sRoleBindings } from '../../../hooks/mcp'
import {
  useServiceExports,
  useServiceImports } from '../../../hooks/useMCS'
import { useCachedBackstage } from '../../../hooks/useCachedBackstage'
import { useCachedContainerd } from '../../../hooks/useCachedContainerd'
import { useCachedCortex } from '../../../hooks/useCachedCortex'
import { useCachedDapr } from '../../../hooks/useCachedDapr'
import { useCachedDragonfly } from '../../../hooks/useCachedDragonfly'
import { useCachedEnvoy } from '../../../components/cards/envoy_status/useCachedEnvoy'
import { useCachedGrpc } from '../../../hooks/useCachedGrpc'
import { useCachedKeda } from '../../../hooks/useCachedKeda'
import { useCachedKserve } from '../../../hooks/useCachedKserve'
import { useCachedKubevela } from '../../../hooks/useCachedKubevela'
import { useCachedLinkerd } from '../../../hooks/useCachedLinkerd'
import { useCachedOpenfeature } from '../../../hooks/useCachedOpenfeature'
import { useCachedLonghorn } from '../../../hooks/useCachedLonghorn'
import { useCachedOpenfga } from '../../../hooks/useCachedOpenfga'
import { useCachedOtel } from '../../../hooks/useCachedOtel'
import { useCachedRook } from '../../../hooks/useCachedRook'
import { useCachedSpiffe } from '../../../hooks/useCachedSpiffe'
import { useCachedCni } from '../../../hooks/useCachedCni'
import { useCachedSpire } from '../../../hooks/useCachedSpire'
import { useCachedStrimzi } from '../../../hooks/useCachedStrimzi'
import { useCachedFlatcar } from '../../../hooks/useCachedFlatcar'
import { useCachedTikv } from '../../../hooks/useCachedTikv'
import { useCachedTuf } from '../../../hooks/useCachedTuf'
import { useCachedCloudCustodian } from '../../../hooks/useCachedCloudCustodian'
import { useCachedVitess } from '../../../hooks/useCachedVitess'
import { useCachedWasmcloud } from '../../../hooks/useCachedWasmcloud'
import { useCachedVolcano } from '../../../hooks/useCachedVolcano'

export const RESOURCE_HOOKS: Array<ResourceHookConfig & { name: string }> = [
  { name: 'useCachedPodIssues', useHook: useCachedPodIssues, dataField: 'data', arity: 'cluster+namespace', wrapRefetch: true },
  { name: 'useCachedEvents', useHook: useCachedEvents, dataField: 'data', arity: 'cluster+namespace', wrapRefetch: true },
  { name: 'useCachedDeployments', useHook: useCachedDeployments, dataField: 'data', arity: 'cluster+namespace', wrapRefetch: true },
  { name: 'useCachedHPAs', useHook: useCachedHPAs, dataField: 'hpas', arity: 'cluster+namespace', wrapRefetch: true, extra: (result) => ({ isDemoData: (result as unknown as Record<string, unknown>).isDemoFallback }) },
  { name: 'useCachedReplicaSets', useHook: useCachedReplicaSets, dataField: 'replicasets', arity: 'cluster+namespace', wrapRefetch: true, extra: (result) => ({ isDemoData: (result as unknown as Record<string, unknown>).isDemoFallback }) },
  { name: 'useCachedStatefulSets', useHook: useCachedStatefulSets, dataField: 'statefulsets', arity: 'cluster+namespace', wrapRefetch: true, extra: (result) => ({ isDemoData: (result as unknown as Record<string, unknown>).isDemoFallback }) },
  { name: 'useCachedDaemonSets', useHook: useCachedDaemonSets, dataField: 'daemonsets', arity: 'cluster+namespace', wrapRefetch: true, extra: (result) => ({ isDemoData: (result as unknown as Record<string, unknown>).isDemoFallback }) },
  { name: 'useCachedCronJobs', useHook: useCachedCronJobs, dataField: 'cronjobs', arity: 'cluster+namespace', wrapRefetch: true, extra: (result) => ({ isDemoData: (result as unknown as Record<string, unknown>).isDemoFallback }) },
  { name: 'useClusters', useHook: useClusters, dataField: 'clusters', arity: 'none' },
  { name: 'usePVCs', useHook: usePVCs, dataField: 'pvcs', arity: 'cluster+namespace' },
  { name: 'useServices', useHook: useServices, dataField: 'services', arity: 'cluster+namespace' },
  { name: 'useCachedDeploymentIssues', useHook: useCachedDeploymentIssues, dataField: 'issues', arity: 'cluster+namespace', dataFallback: [] },
  { name: 'useOperators', useHook: useOperators, dataField: 'operators', arity: 'cluster' },
  { name: 'useHelmReleases', useHook: useHelmReleases, dataField: 'releases', arity: 'cluster' },
  { name: 'useConfigMaps', useHook: useConfigMaps, dataField: 'configmaps', arity: 'cluster+namespace' },
  { name: 'useSecrets', useHook: useSecrets, dataField: 'secrets', arity: 'cluster+namespace' },
  { name: 'useIngresses', useHook: useIngresses, dataField: 'ingresses', arity: 'cluster+namespace', extra: (result) => ({ isDemoData: (result as unknown as Record<string, unknown>).isDemoFallback }) },
  { name: 'useNodes', useHook: useNodes, dataField: 'nodes', arity: 'cluster' },
  { name: 'useJobs', useHook: useJobs, dataField: 'jobs', arity: 'cluster+namespace' },
  { name: 'useCronJobs', useHook: useCronJobs, dataField: 'cronJobs', arity: 'cluster+namespace' },
  { name: 'useStatefulSets', useHook: useStatefulSets, dataField: 'statefulSets', arity: 'cluster+namespace' },
  { name: 'useDaemonSets', useHook: useDaemonSets, dataField: 'daemonSets', arity: 'cluster+namespace' },
  { name: 'useHPAs', useHook: useHPAs, dataField: 'hpas', arity: 'cluster+namespace' },
  { name: 'useReplicaSets', useHook: useReplicaSets, dataField: 'replicaSets', arity: 'cluster+namespace' },
  { name: 'usePVs', useHook: usePVs, dataField: 'pvs', arity: 'cluster' },
  { name: 'useResourceQuotas', useHook: useResourceQuotas, dataField: 'resourceQuotas', arity: 'cluster+namespace', extra: (result) => ({ isDemoData: (result as unknown as Record<string, unknown>).isDemoFallback }) },
  { name: 'useLimitRanges', useHook: useLimitRanges, dataField: 'limitRanges', arity: 'cluster+namespace' },
  { name: 'useNetworkPolicies', useHook: useNetworkPolicies, dataField: 'networkpolicies', arity: 'cluster+namespace' },
  { name: 'useNamespaces', useHook: useNamespaces, dataField: 'namespaces', arity: 'cluster' },
  { name: 'useOperatorSubscriptions', useHook: useOperatorSubscriptions, dataField: 'subscriptions', arity: 'cluster' },
  { name: 'useServiceAccounts', useHook: useServiceAccounts, dataField: 'serviceAccounts', arity: 'cluster+namespace' },
  { name: 'useK8sRoles', useHook: useK8sRoles, dataField: 'roles', arity: 'cluster+namespace' },
  { name: 'useK8sRoleBindings', useHook: useK8sRoleBindings, dataField: 'bindings', arity: 'cluster+namespace' },
  { name: 'useServiceExports', useHook: useServiceExports, dataField: 'exports', arity: 'cluster+namespace' },
  { name: 'useServiceImports', useHook: useServiceImports, dataField: 'imports', arity: 'cluster+namespace' },
]

export const CACHED_STATUS_HOOKS: Array<CachedStatusHookConfig & { name: string }> = [
  { name: 'useCachedBackstage', useCachedHook: useCachedBackstage, dataField: 'plugins', loadingField: 'isLoading', errorMode: 'passthrough' },
  { name: 'useCachedContainerd', useCachedHook: useCachedContainerd, dataField: 'containers', loadingField: 'isLoading', errorMode: 'isFailed', errorMsg: 'Failed to fetch containerd status', wrapRefetch: true },
  { name: 'useCachedCortex', useCachedHook: useCachedCortex, dataField: 'components', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch Cortex status', wrapRefetch: true },
  { name: 'useCachedDapr', useCachedHook: useCachedDapr, dataField: 'components', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch Dapr status', wrapRefetch: true },
  { name: 'useCachedDragonfly', useCachedHook: useCachedDragonfly, dataField: 'components', loadingField: 'isLoading', errorMode: 'isFailed', errorMsg: 'Failed to fetch Dragonfly status', wrapRefetch: true },
  { name: 'useCachedEnvoy', useCachedHook: useCachedEnvoy, dataField: 'listeners', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch Envoy status', wrapRefetch: true },
  { name: 'useCachedGrpc', useCachedHook: useCachedGrpc, dataField: 'services', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch gRPC status', wrapRefetch: true },
  { name: 'useCachedKeda', useCachedHook: useCachedKeda, dataField: 'scaledObjects', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch KEDA status', optionalData: true, refetchOverride: () => async () => {} },
  { name: 'useCachedKserve', useCachedHook: useCachedKserve, dataField: 'services', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch KServe status', optionalData: true, wrapRefetch: true },
  { name: 'useCachedLinkerd', useCachedHook: useCachedLinkerd, dataField: 'deployments', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch Linkerd status', wrapRefetch: true },
  { name: 'useCachedLonghorn', useCachedHook: useCachedLonghorn, dataField: 'volumes', loadingField: 'isLoading', errorMode: 'passthrough' },
  { name: 'useCachedOtel', useCachedHook: useCachedOtel, dataField: 'collectors', loadingField: 'isLoading', errorMode: 'passthrough' },
  { name: 'useCachedRook', useCachedHook: useCachedRook, dataField: 'clusters', loadingField: 'isLoading', errorMode: 'passthrough' },
  { name: 'useCachedSpiffe', useCachedHook: useCachedSpiffe, dataField: 'entries', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch SPIFFE status', wrapRefetch: true },
  { name: 'useCachedCni', useCachedHook: useCachedCni, dataField: 'nodes', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch CNI status', wrapRefetch: true },
  { name: 'useCachedOpenfeature', useCachedHook: useCachedOpenfeature, dataField: 'flags', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch OpenFeature status', wrapRefetch: true },
  { name: 'useCachedSpire', useCachedHook: useCachedSpire, dataField: 'serverPods', loadingField: 'isLoading', errorMode: 'passthrough' },
  { name: 'useCachedKubevela', useCachedHook: useCachedKubevela, dataField: 'applications', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch KubeVela status', wrapRefetch: true },
  { name: 'useCachedStrimzi', useCachedHook: useCachedStrimzi, dataField: 'clusters', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch Strimzi status', wrapRefetch: true },
  { name: 'useCachedOpenfga', useCachedHook: useCachedOpenfga, dataField: 'stores', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch OpenFGA status', wrapRefetch: true },
  { name: 'useCachedFlatcar', useCachedHook: useCachedFlatcar, dataField: 'nodes', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch Flatcar status', wrapRefetch: true },
  { name: 'useCachedTikv', useCachedHook: useCachedTikv, dataField: 'stores', loadingField: 'isLoading', errorMode: 'passthrough' },
  { name: 'useCachedTuf', useCachedHook: useCachedTuf, dataField: 'roles', loadingField: 'isLoading', errorMode: 'passthrough' },
  { name: 'useCachedCloudCustodian', useCachedHook: useCachedCloudCustodian, dataField: 'policies', loadingField: 'isLoading', errorMode: 'passthrough' },
  { name: 'useCachedVitess', useCachedHook: useCachedVitess, dataField: 'keyspaces', loadingField: 'isLoading', errorMode: 'passthrough' },
  { name: 'useCachedWasmcloud', useCachedHook: useCachedWasmcloud, dataField: 'hosts', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch wasmCloud status', wrapRefetch: true },
  { name: 'useCachedVolcano', useCachedHook: useCachedVolcano, dataField: 'jobs', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch Volcano status', wrapRefetch: true },
]
