import { ChevronRight, ChevronDown, Box, Layers, Network, Activity, Briefcase, Lock, Settings, User, HardDrive } from 'lucide-react'
import { StatusBadge } from '../../ui/StatusBadge'
import { TechnicalAcronym } from '../../shared/TechnicalAcronym'
import { useTranslation } from 'react-i18next'
import type { ResourceKind } from './resourceHelpers'

interface Pod { name: string; namespace: string; status: string; ready: string; restarts: number; node: string; age: string }
interface Deployment { name: string; namespace: string; status: string; replicas: number; readyReplicas: number; image: string; age: string }
interface Service { name: string; namespace: string; type: string; clusterIP: string; externalIP: string; ports: string[]; endpoints: string; lbStatus: string; age: string }
interface Job { name: string; namespace: string; status: string; completions: string; duration: string; age: string }
interface HPA { name: string; namespace: string; reference: string; minReplicas: number; maxReplicas: number; currentReplicas: number; targetCPU: string; currentCPU: string; age: string }
interface ConfigMap { name: string; namespace: string; dataCount: number; age: string }
interface Secret { name: string; namespace: string; type: string; dataCount: number; age: string }
interface ServiceAccount { name: string; namespace: string; secrets?: string[]; imagePullSecrets?: string[]; age: string }
interface PVC { name: string; namespace: string; status: string; storageClass: string; capacity: string; accessModes: string[]; volumeName: string; age: string }

interface PodsByDeployment {
  byDeployment: Record<string, Pod[]>
  standalone: Pod[]
}

interface ResourceTreeViewProps {
  deployments: Deployment[]
  pods: Pod[]
  services: Service[]
  jobs: Job[]
  hpas: HPA[]
  configmaps: ConfigMap[]
  secrets: Secret[]
  serviceAccounts: ServiceAccount[]
  pvcs: PVC[]
  podsByDeployment: PodsByDeployment
  expandedTypes: Set<string>
  expandedItems: Set<string>
  deploymentsLoading: boolean
  toggleType: (type: string) => void
  toggleItem: (item: string) => void
  onResourceClick: (kind: ResourceKind, name: string, ns: string, data?: Record<string, unknown>) => void
}

export function ResourceTreeView({
  deployments, pods, services, jobs, hpas,
  configmaps, secrets, serviceAccounts, pvcs,
  podsByDeployment, expandedTypes, expandedItems,
  deploymentsLoading, toggleType, toggleItem, onResourceClick,
}: ResourceTreeViewProps) {
  const { t } = useTranslation()

  return (
    <div className="font-mono text-xs max-h-[300px] overflow-y-auto">
      <div className="border-l border-border/50 pl-2">
        {deployments.length > 0 && (
          <div className="mb-1">
            <button onClick={() => toggleType('deployments')} disabled={deploymentsLoading} className="flex min-w-11 items-center gap-1.5 p-3 hover:bg-card/30 rounded w-full text-left min-h-11 disabled:opacity-50 disabled:cursor-not-allowed">
              {expandedTypes.has('deployments') ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
              <StatusBadge color="purple" icon={<Layers className="w-3 h-3" />}>Deploy</StatusBadge>
              <span className="text-muted-foreground">({deployments.length})</span>
            </button>
            {expandedTypes.has('deployments') && (
              <div className="ml-4 border-l border-border/30 pl-2">
                {deployments.map((dep) => {
                  const depPods = podsByDeployment.byDeployment[dep.name] || []
                  const isExpanded = expandedItems.has(`dep-${dep.name}`)
                  return (
                    <div key={dep.name} className="mb-0.5">
                      <div className="flex items-center gap-2 min-h-11 px-1 rounded hover:bg-card/30">
                        <button onClick={() => depPods.length > 0 && toggleItem(`dep-${dep.name}`)} className="min-h-11 min-w-[44px] flex items-center justify-center">
                          {depPods.length > 0 ? (isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />) : <span className="w-3" />}
                        </button>
                        <button
                          onClick={() => onResourceClick('Deployment', dep.name, dep.namespace, { replicas: dep.replicas, readyReplicas: dep.readyReplicas, status: dep.status })}
                          className="flex items-center gap-2 flex-1 min-h-11"
                        >
                          <span className="text-foreground">{dep.name}</span>
                          <span className={`text-xs ${dep.readyReplicas === dep.replicas ? 'text-green-400' : 'text-orange-400'}`}>{dep.readyReplicas}/{dep.replicas}</span>
                          {depPods.length > 0 && <span className="text-xs text-muted-foreground">({depPods.length} pods)</span>}
                          <ChevronRight className="w-3 h-3 text-primary ml-auto" />
                        </button>
                      </div>
                      {isExpanded && depPods.length > 0 && (
                        <div className="ml-4 border-l border-border/30 pl-2">
                          {depPods.slice(0, 10).map(pod => (
                            <div
                              key={pod.name}
                              className="flex items-center gap-2 min-h-11 px-1 text-xs cursor-pointer hover:bg-card/30 rounded"
                              onClick={() => onResourceClick('Pod', pod.name, pod.namespace, { status: pod.status, restarts: pod.restarts })}
                            >
                              <Box className="w-3 h-3 text-blue-400" />
                              <span className="text-foreground truncate max-w-[200px]" title={pod.name}>{pod.name}</span>
                              <span className={pod.status === 'Running' ? 'text-green-400' : pod.status === 'Pending' ? 'text-yellow-400' : 'text-red-400'}>{pod.status}</span>
                              <ChevronRight className="w-3 h-3 text-primary ml-auto" />
                            </div>
                          ))}
                          {depPods.length > 10 && <div className="text-xs text-muted-foreground pl-5">+{depPods.length - 10} more</div>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {podsByDeployment.standalone.length > 0 && (
          <div className="mb-1">
            <button onClick={() => toggleType('pods')} className="flex min-w-11 items-center gap-1.5 p-3 hover:bg-card/30 rounded w-full text-left min-h-11">
              {expandedTypes.has('pods') ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
              <StatusBadge color="blue" icon={<Box className="w-3 h-3" />}>{t('common.pod')}</StatusBadge>
              <span className="text-muted-foreground">Standalone ({podsByDeployment.standalone.length})</span>
            </button>
            {expandedTypes.has('pods') && (
              <div className="ml-4 border-l border-border/30 pl-2">
                {podsByDeployment.standalone.slice(0, 20).map(pod => (
                  <div
                    key={pod.name}
                    className="flex items-center gap-2 min-h-11 px-1 text-xs cursor-pointer hover:bg-card/30 rounded"
                    onClick={() => onResourceClick('Pod', pod.name, pod.namespace, { status: pod.status, restarts: pod.restarts })}
                  >
                    <Box className="w-3 h-3 text-blue-400" />
                    <span className="text-foreground truncate max-w-[200px]" title={pod.name}>{pod.name}</span>
                    <span className={pod.status === 'Running' ? 'text-green-400' : pod.status === 'Pending' ? 'text-yellow-400' : 'text-red-400'}>{pod.status}</span>
                    <ChevronRight className="w-3 h-3 text-primary ml-auto" />
                  </div>
                ))}
                {podsByDeployment.standalone.length > 20 && <div className="text-xs text-muted-foreground pl-5">+{podsByDeployment.standalone.length - 20} more</div>}
              </div>
            )}
          </div>
        )}

        {services.length > 0 && (
          <div className="mb-1">
            <button onClick={() => toggleType('services')} className="flex min-w-11 items-center gap-1.5 p-3 hover:bg-card/30 rounded w-full text-left min-h-11">
              {expandedTypes.has('services') ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
              <StatusBadge color="cyan" icon={<Network className="w-3 h-3" />}>Svc</StatusBadge>
              <span className="text-muted-foreground">({services.length})</span>
            </button>
            {expandedTypes.has('services') && (
              <div className="ml-4 border-l border-border/30 pl-2">
                {services.map(svc => (
                  <div
                    key={svc.name}
                    className="flex items-center gap-2 min-h-11 px-1 text-xs cursor-pointer hover:bg-card/30 rounded"
                    onClick={() => onResourceClick('Service', svc.name, svc.namespace, { type: svc.type, clusterIP: svc.clusterIP, ports: svc.ports })}
                  >
                    <Network className="w-3 h-3 text-cyan-400" />
                    <span className="text-foreground truncate max-w-[200px]" title={svc.name}>{svc.name}</span>
                    <span className="text-cyan-400">{svc.type}</span>
                    {svc.ports && svc.ports.length > 0 && <span className="text-muted-foreground">{svc.ports[0]}</span>}
                    <ChevronRight className="w-3 h-3 text-primary ml-auto" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {jobs.length > 0 && (
          <div className="mb-1">
            <button onClick={() => toggleType('jobs')} className="flex min-w-11 items-center gap-1.5 p-3 hover:bg-card/30 rounded w-full text-left min-h-11">
              {expandedTypes.has('jobs') ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
              <StatusBadge color="yellow" icon={<Briefcase className="w-3 h-3" />}>Job</StatusBadge>
              <span className="text-muted-foreground">({jobs.length})</span>
            </button>
            {expandedTypes.has('jobs') && (
              <div className="ml-4 border-l border-border/30 pl-2">
                {jobs.map(job => (
                  <div
                    key={job.name}
                    className="flex items-center gap-2 min-h-11 px-1 text-xs cursor-pointer hover:bg-card/30 rounded"
                    onClick={() => onResourceClick('Job', job.name, job.namespace, { status: job.status, completions: job.completions })}
                  >
                    <Briefcase className="w-3 h-3 text-yellow-400" />
                    <span className="text-foreground truncate max-w-[200px]" title={job.name}>{job.name}</span>
                    <span className={job.status === 'Complete' ? 'text-green-400' : job.status === 'Running' ? 'text-green-400' : 'text-red-400'}>{job.status}</span>
                    <span className="text-muted-foreground">{job.completions}</span>
                    <ChevronRight className="w-3 h-3 text-primary ml-auto" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {hpas.length > 0 && (
          <div className="mb-1">
            <button onClick={() => toggleType('hpas')} className="flex min-w-11 items-center gap-1.5 p-3 hover:bg-card/30 rounded w-full text-left min-h-11">
              {expandedTypes.has('hpas') ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
              <StatusBadge color="purple" icon={<Activity className="w-3 h-3" />}><TechnicalAcronym term="HPA">HPA</TechnicalAcronym></StatusBadge>
              <span className="text-muted-foreground">({hpas.length})</span>
            </button>
            {expandedTypes.has('hpas') && (
              <div className="ml-4 border-l border-border/30 pl-2">
                {hpas.map(hpa => (
                  <div
                    key={hpa.name}
                    className="flex items-center gap-2 min-h-11 px-1 text-xs cursor-pointer hover:bg-card/30 rounded"
                    onClick={() => onResourceClick('HPA', hpa.name, hpa.namespace, { reference: hpa.reference, minReplicas: hpa.minReplicas, maxReplicas: hpa.maxReplicas })}
                  >
                    <Activity className="w-3 h-3 text-purple-400" />
                    <span className="text-foreground truncate max-w-[200px]" title={hpa.name}>{hpa.name}</span>
                    <span className="text-purple-400">{hpa.currentReplicas}/{hpa.minReplicas}-{hpa.maxReplicas}</span>
                    <span className="text-muted-foreground">→ {hpa.reference}</span>
                    <ChevronRight className="w-3 h-3 text-primary ml-auto" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {serviceAccounts.length > 0 && (
          <div className="mb-1">
            <button onClick={() => toggleType('serviceaccounts')} className="flex min-w-11 items-center gap-1.5 p-3 hover:bg-card/30 rounded w-full text-left min-h-11">
              {expandedTypes.has('serviceaccounts') ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
              <StatusBadge color="cyan" icon={<User className="w-3 h-3" />}>SA</StatusBadge>
              <span className="text-muted-foreground">({serviceAccounts.length})</span>
            </button>
            {expandedTypes.has('serviceaccounts') && (
              <div className="ml-4 border-l border-border/30 pl-2">
                {serviceAccounts.slice(0, 20).map(sa => (
                  <div
                    key={sa.name}
                    className="flex items-center gap-2 min-h-11 px-1 text-xs cursor-pointer hover:bg-card/30 rounded"
                    onClick={() => onResourceClick('ServiceAccount', sa.name, sa.namespace, { secrets: sa.secrets, imagePullSecrets: sa.imagePullSecrets })}
                  >
                    <User className="w-3 h-3 text-cyan-400" />
                    <span className="text-foreground truncate max-w-[200px]" title={sa.name}>{sa.name}</span>
                    <span className="text-muted-foreground">{sa.secrets?.length || 0} secrets</span>
                    <ChevronRight className="w-3 h-3 text-primary ml-auto" />
                  </div>
                ))}
                {serviceAccounts.length > 20 && <div className="text-xs text-muted-foreground pl-5">+{serviceAccounts.length - 20} more</div>}
              </div>
            )}
          </div>
        )}

        {pvcs.length > 0 && (
          <div className="mb-1">
            <button onClick={() => toggleType('pvcs')} className="flex min-w-11 items-center gap-1.5 p-3 hover:bg-card/30 rounded w-full text-left min-h-11">
              {expandedTypes.has('pvcs') ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
              <StatusBadge color="green" icon={<HardDrive className="w-3 h-3" />}><TechnicalAcronym term="PVC">PVC</TechnicalAcronym></StatusBadge>
              <span className="text-muted-foreground">({pvcs.length})</span>
            </button>
            {expandedTypes.has('pvcs') && (
              <div className="ml-4 border-l border-border/30 pl-2">
                {pvcs.slice(0, 20).map(pvc => (
                  <div
                    key={pvc.name}
                    className="flex items-center gap-2 min-h-11 px-1 text-xs cursor-pointer hover:bg-card/30 rounded"
                    onClick={() => onResourceClick('PVC', pvc.name, pvc.namespace, { status: pvc.status, storageClass: pvc.storageClass, capacity: pvc.capacity })}
                  >
                    <HardDrive className="w-3 h-3 text-green-400" />
                    <span className="text-foreground truncate max-w-[200px]" title={pvc.name}>{pvc.name}</span>
                    <span className={pvc.status === 'Bound' ? 'text-green-400' : pvc.status === 'Pending' ? 'text-yellow-400' : 'text-red-400'}>{pvc.status}</span>
                    {pvc.capacity && <span className="text-muted-foreground">{pvc.capacity}</span>}
                    <ChevronRight className="w-3 h-3 text-primary ml-auto" />
                  </div>
                ))}
                {pvcs.length > 20 && <div className="text-xs text-muted-foreground pl-5">+{pvcs.length - 20} more</div>}
              </div>
            )}
          </div>
        )}

        {configmaps.length > 0 && (
          <div className="mb-1">
            <button onClick={() => toggleType('configmaps')} className="flex min-w-11 items-center gap-1.5 p-3 hover:bg-card/30 rounded w-full text-left min-h-11">
              {expandedTypes.has('configmaps') ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
              <StatusBadge color="orange" icon={<Settings className="w-3 h-3" />}>CM</StatusBadge>
              <span className="text-muted-foreground">({configmaps.length})</span>
            </button>
            {expandedTypes.has('configmaps') && (
              <div className="ml-4 border-l border-border/30 pl-2">
                {configmaps.slice(0, 20).map(cm => (
                  <div
                    key={cm.name}
                    className="flex items-center gap-2 min-h-11 px-1 text-xs cursor-pointer hover:bg-card/30 rounded"
                    onClick={() => onResourceClick('ConfigMap', cm.name, cm.namespace, { dataCount: cm.dataCount })}
                  >
                    <Settings className="w-3 h-3 text-orange-400" />
                    <span className="text-foreground truncate max-w-[200px]" title={cm.name}>{cm.name}</span>
                    <span className="text-muted-foreground">{cm.dataCount} keys</span>
                    <ChevronRight className="w-3 h-3 text-primary ml-auto" />
                  </div>
                ))}
                {configmaps.length > 20 && <div className="text-xs text-muted-foreground pl-5">+{configmaps.length - 20} more</div>}
              </div>
            )}
          </div>
        )}

        {secrets.length > 0 && (
          <div className="mb-1">
            <button onClick={() => toggleType('secrets')} className="flex min-w-11 items-center gap-1.5 p-3 hover:bg-card/30 rounded w-full text-left min-h-11">
              {expandedTypes.has('secrets') ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
              <StatusBadge color="purple" icon={<Lock className="w-3 h-3" />}>Secret</StatusBadge>
              <span className="text-muted-foreground">({secrets.length})</span>
            </button>
            {expandedTypes.has('secrets') && (
              <div className="ml-4 border-l border-border/30 pl-2">
                {secrets.slice(0, 20).map(secret => (
                  <div
                    key={secret.name}
                    className="flex items-center gap-2 min-h-11 px-1 text-xs cursor-pointer hover:bg-card/30 rounded"
                    onClick={() => onResourceClick('Secret', secret.name, secret.namespace, { type: secret.type, dataCount: secret.dataCount })}
                  >
                    <Lock className="w-3 h-3 text-purple-400" />
                    <span className="text-foreground truncate max-w-[200px]" title={secret.name}>{secret.name}</span>
                    <span className="text-purple-400">{secret.type}</span>
                    <span className="text-muted-foreground">{secret.dataCount} keys</span>
                    <ChevronRight className="w-3 h-3 text-primary ml-auto" />
                  </div>
                ))}
                {secrets.length > 20 && <div className="text-xs text-muted-foreground pl-5">+{secrets.length - 20} more</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
