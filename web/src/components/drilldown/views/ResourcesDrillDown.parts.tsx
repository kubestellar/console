import {
  Cpu,
  GripVertical,
  MemoryStick,
  Server,
  ChevronRight
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ClusterInfo } from '../../../hooks/useMCP'
import { Gauge } from '../../charts/Gauge'
import { StatusIndicator } from '../../charts/StatusIndicator'
import { TechnicalAcronym } from '../../shared/TechnicalAcronym'

const MEMORY_TERABYTE_THRESHOLD_GB = 1000
const GIGABYTES_PER_TERABYTE = 1024
const PERCENTAGE_MAX = 100

export interface AcceleratorInfo {
  key: string
  label: string
  color: string
  data: { total: number; allocated: number }
}

interface ActiveAccelerator {
  key: string
  label: string
  color: string
  globalData: { total: number; allocated: number }
}

interface ResourceTotals {
  cpus: number
  cpuRequests: number
  cpuPercent: number
  nodes: number
  pods: number
  memoryGB: number
  memoryRequestsGB: number
  memoryPercent: number
}

interface SortableClusterRowProps {
  cluster: ClusterInfo
  cpuPercent: number
  memoryPercent: number
  memoryGB: number
  accelerators: AcceleratorInfo[]
  onDrillDown: () => void
}
interface ResourcesSummaryProps {
  clustersCount: number
  totals: ResourceTotals
  accelerators: ActiveAccelerator[]
}
interface ResourcesClusterListHeaderProps {
  clustersCount: number
  accelerators: ActiveAccelerator[]
}

function formatMemory(gigabytes: number): string {
  if (gigabytes >= MEMORY_TERABYTE_THRESHOLD_GB) {
    return `${(gigabytes / GIGABYTES_PER_TERABYTE).toFixed(1)}T`
  }
  return `${Math.round(gigabytes)}G`
}

export function SortableClusterRow({
  cluster,
  cpuPercent,
  memoryPercent,
  memoryGB,
  accelerators,
  onDrillDown
}: SortableClusterRowProps) {
  const { t } = useTranslation()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: cluster.name })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-2.5 rounded-lg bg-card/50 border border-border hover:bg-card hover:border-primary/50 transition-colors group cursor-pointer"
      onClick={onDrillDown}
    >
      <button
        {...attributes}
        {...listeners}
        className="p-1 rounded hover:bg-secondary cursor-grab active:cursor-grabbing touch-none shrink-0"
        title={t('resourcesDrillDown.dragToReorder')}
        onClick={(event) => event.stopPropagation()}
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </button>
      <div className="w-[90px] shrink-0">
        <StatusIndicator
          status={
            cluster.reachable === false
              ? 'unreachable'
              : cluster.nodeCount && cluster.nodeCount > 0
                ? 'healthy'
                : cluster.healthy
                  ? 'healthy'
                  : 'error'
          }
        />
      </div>
      <div className="w-[160px] shrink-0">
        <div className="font-medium text-foreground text-sm truncate">
          {cluster.name.split('/').pop()}
        </div>
        <div className="text-2xs text-muted-foreground truncate">
          {cluster.reachable !== false
            ? t('resourcesDrillDown.nodePodCount', {
                nodes: cluster.nodeCount ?? '-',
                pods: cluster.podCount ?? '-'
              })
            : t('resourcesDrillDown.offline')}
        </div>
      </div>
      <ResourceGauge
        percent={cpuPercent}
        value={cluster.cpuCores || 0}
        warning={70}
        critical={90}
      />
      <ResourceGauge
        percent={memoryPercent}
        value={formatMemory(memoryGB)}
        warning={75}
        critical={90}
      />
      {(accelerators || []).map((accelerator) => (
        <AcceleratorGauge key={accelerator.key} accelerator={accelerator} />
      ))}
      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </div>
  )
}

function ResourceGauge({
  percent,
  value,
  warning,
  critical
}: {
  percent: number
  value: string | number
  warning: number
  critical: number
}) {
  return (
    <div className="w-[130px] shrink-0 flex items-center gap-2 justify-center">
      <Gauge
        value={Math.min(percent, PERCENTAGE_MAX)}
        max={PERCENTAGE_MAX}
        size="xs"
        thresholds={{ warning, critical }}
      />
      <div className="text-right">
        <div
          className={`text-xs font-medium ${percent > PERCENTAGE_MAX ? 'text-red-400' : 'text-foreground'}`}
        >
          {percent}%
        </div>
        <div className="text-2xs text-muted-foreground">{value}</div>
      </div>
    </div>
  )
}

function AcceleratorGauge({ accelerator }: { accelerator: AcceleratorInfo }) {
  const { t } = useTranslation()
  const percentage =
    accelerator.data.total > 0
      ? Math.round(
          (accelerator.data.allocated / accelerator.data.total) * PERCENTAGE_MAX
        )
      : 0
  return (
    <div className="w-[110px] shrink-0 flex items-center gap-2 justify-center">
      {accelerator.data.total > 0 ? (
        <>
          <Gauge
            value={Math.min(percentage, PERCENTAGE_MAX)}
            max={PERCENTAGE_MAX}
            size="xs"
            thresholds={{ warning: 80, critical: 95 }}
          />
          <div className="text-right">
            <div
              className={`text-xs font-medium ${percentage > PERCENTAGE_MAX ? 'text-red-400' : 'text-foreground'}`}
            >
              {percentage}%
            </div>
            <div className={`text-2xs ${accelerator.color}`}>
              {accelerator.data.allocated}/{accelerator.data.total}
            </div>
          </div>
        </>
      ) : (
        <span className="text-2xs text-muted-foreground/50">
          {t('resourcesDrillDown.noAccelerator', {
            accelerator: accelerator.label
          })}
        </span>
      )}
    </div>
  )
}

export function ResourcesSummary({
  clustersCount,
  totals,
  accelerators
}: ResourcesSummaryProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-3">
      <SummaryCard
        icon={<Server className="w-3.5 h-3.5 text-blue-400" />}
        label={t('resourcesDrillDown.clusters')}
        value={clustersCount}
      />
      <SummaryCard
        icon={<Server className="w-3.5 h-3.5 text-purple-400" />}
        label={t('common.nodes')}
        value={totals.nodes}
      />
      <SummaryCard
        icon={<Cpu className="w-3.5 h-3.5 text-blue-400" />}
        label={
          <>
            <TechnicalAcronym term="CPU">CPU</TechnicalAcronym>{' '}
            {t('resourcesDrillDown.capacity')}
          </>
        }
        value={t('resourcesDrillDown.cores', {
          count: totals.cpus.toLocaleString()
        })}
        detail={t('resourcesDrillDown.utilizedRequested', {
          percent: totals.cpuPercent,
          requested: totals.cpuRequests.toLocaleString()
        })}
      />
      <SummaryCard
        icon={<MemoryStick className="w-3.5 h-3.5 text-yellow-400" />}
        label={t('resourcesDrillDown.memoryCapacity')}
        value={
          totals.memoryGB >= MEMORY_TERABYTE_THRESHOLD_GB
            ? `${(totals.memoryGB / GIGABYTES_PER_TERABYTE).toFixed(1)} TB`
            : `${Math.round(totals.memoryGB)} GB`
        }
        detail={t('resourcesDrillDown.utilizedRequested', {
          percent: totals.memoryPercent,
          requested: formatMemory(totals.memoryRequestsGB)
        })}
      />
      {(accelerators || []).map((accelerator) => (
        <SummaryCard
          key={accelerator.key}
          icon={<Cpu className={`w-3.5 h-3.5 ${accelerator.color}`} />}
          label={t('resourcesDrillDown.acceleratorAllocated', {
            accelerator: accelerator.label
          })}
          value={
            <>
              <span className={accelerator.color}>
                {accelerator.globalData.allocated}
              </span>
              <span className="text-muted-foreground">
                /{accelerator.globalData.total}
              </span>
            </>
          }
        />
      ))}
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  detail
}: {
  icon: ReactNode
  label: ReactNode
  value: ReactNode
  detail?: string
}) {
  return (
    <div className="p-3 rounded-lg bg-card/50 border border-border min-w-[120px]">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-bold text-foreground">{value}</div>
      {detail && (
        <div className="text-2xs text-muted-foreground mt-0.5">{detail}</div>
      )}
    </div>
  )
}

export function ResourcesClusterListHeader({
  clustersCount,
  accelerators
}: ResourcesClusterListHeaderProps) {
  const { t } = useTranslation()
  return (
    <>
      <h3 className="text-sm font-semibold text-foreground mb-2">
        {t('resourcesDrillDown.clustersWithCount', { count: clustersCount })}
      </h3>
      <div className="flex items-center gap-3 px-2.5 py-1.5 text-2xs text-muted-foreground uppercase tracking-wider mb-1">
        <div className="p-1 shrink-0">
          <div className="w-4 h-4" />
        </div>
        <div className="w-[90px] shrink-0" />
        <div className="w-[160px] shrink-0">{t('common.cluster')}</div>
        <div className="w-[130px] shrink-0 text-center">
          <Cpu className="w-3 h-3 text-blue-400 inline mr-1" />
          <span>{t('common.cpu')}</span>
        </div>
        <div className="w-[130px] shrink-0 text-center">
          <MemoryStick className="w-3 h-3 text-yellow-400 inline mr-1" />
          <span>{t('common.memory')}</span>
        </div>
        {(accelerators || []).map((accelerator) => (
          <div key={accelerator.key} className="w-[110px] shrink-0 text-center">
            <Cpu className={`w-3 h-3 ${accelerator.color} inline mr-1`} />
            <span>{accelerator.label}</span>
          </div>
        ))}
        <div className="w-4 shrink-0" />
      </div>
    </>
  )
}
