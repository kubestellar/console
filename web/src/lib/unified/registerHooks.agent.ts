import { useCachedBackstage } from '../../hooks/useCachedBackstage'
import { useCachedContainerd } from '../../hooks/useCachedContainerd'
import { useCachedCortex } from '../../hooks/useCachedCortex'
import { useCachedDapr } from '../../hooks/useCachedDapr'
import { useCachedDragonfly } from '../../hooks/useCachedDragonfly'
import { useCachedEnvoy } from '../../components/cards/envoy_status/useCachedEnvoy'
import { useCachedGrpc } from '../../hooks/useCachedGrpc'
import { useCachedKeda } from '../../hooks/useCachedKeda'
import { useCachedKserve } from '../../hooks/useCachedKserve'
import { useCachedKubevela } from '../../hooks/useCachedKubevela'
import { useCachedLinkerd } from '../../hooks/useCachedLinkerd'
import { useCachedOpenfeature } from '../../hooks/useCachedOpenfeature'
import { useCachedLonghorn } from '../../hooks/useCachedLonghorn'
import { useCachedOpenfga } from '../../hooks/useCachedOpenfga'
import { useCachedOtel } from '../../hooks/useCachedOtel'
import { useCachedRook } from '../../hooks/useCachedRook'
import { useCachedSpiffe } from '../../hooks/useCachedSpiffe'
import { useCachedCni } from '../../hooks/useCachedCni'
import { useCachedSpire } from '../../hooks/useCachedSpire'
import { useCachedStrimzi } from '../../hooks/useCachedStrimzi'
import { useCachedFlatcar } from '../../hooks/useCachedFlatcar'
import { useCachedTikv } from '../../hooks/useCachedTikv'
import { useCachedTuf } from '../../hooks/useCachedTuf'
import { useCachedCloudCustodian } from '../../hooks/useCachedCloudCustodian'
import { useCachedVitess } from '../../hooks/useCachedVitess'
import { useCachedWasmcloud } from '../../hooks/useCachedWasmcloud'
import { useCachedVolcano } from '../../hooks/useCachedVolcano'
import type { CachedStatusHookConfig } from './registerHooks.shared'
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
