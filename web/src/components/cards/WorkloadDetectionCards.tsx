import { useState, useMemo } from 'react'
import {
  Wrench, CheckCircle, XCircle, Clock, AlertTriangle, ExternalLink,
  Cpu, BrainCircuit, Notebook, BarChart3, Layers, Activity, AlertCircle,
  Play, Pause, RefreshCw, Zap
} from 'lucide-react'
import { Skeleton } from '../ui/Skeleton'
import { CardControls, SortDirection } from '../ui/CardControls'
import { usePagination, Pagination } from '../ui/Pagination'

// =============================================================================
// SHARED TYPES AND UTILITIES
// =============================================================================

interface DemoState {
  isLoading: boolean
  lastUpdated: Date | null
}

function useDemoData<T>(data: T): DemoState & { data: T } {
  const [isLoading] = useState(false)
  const [lastUpdated] = useState<Date | null>(new Date())
  return { data, isLoading, lastUpdated }
}

// =============================================================================
// PROW CARDS
// =============================================================================

// Demo data for Prow jobs
const DEMO_PROW_JOBS = [
  { name: 'pull-kubernetes-e2e', type: 'presubmit', state: 'success', duration: '45m', pr: '#12345', started: '10m ago' },
  { name: 'pull-kubernetes-unit', type: 'presubmit', state: 'success', duration: '12m', pr: '#12346', started: '15m ago' },
  { name: 'pull-kubernetes-verify', type: 'presubmit', state: 'pending', duration: '-', pr: '#12347', started: '2m ago' },
  { name: 'ci-kubernetes-e2e-gce', type: 'periodic', state: 'failure', duration: '1h 23m', pr: '-', started: '30m ago' },
  { name: 'post-kubernetes-push-image', type: 'postsubmit', state: 'success', duration: '8m', pr: '-', started: '1h ago' },
  { name: 'pull-kubernetes-integration', type: 'presubmit', state: 'aborted', duration: '5m', pr: '#12344', started: '20m ago' },
]

const DEMO_PROW_STATUS = {
  healthy: true,
  version: 'v0.0.0-20240115',
  pendingJobs: 12,
  runningJobs: 8,
  queuedJobs: 24,
  prowJobsLastHour: 156,
  successRate: 94.2,
}

interface ProwJobsProps {
  config?: Record<string, unknown>
}

export function ProwJobs({ config: _config }: ProwJobsProps) {
  const { data: jobs, isLoading } = useDemoData(DEMO_PROW_JOBS)
  const [sortBy, setSortBy] = useState<'name' | 'state' | 'started'>('started')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)

  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => {
      let compare = 0
      switch (sortBy) {
        case 'name':
          compare = a.name.localeCompare(b.name)
          break
        case 'state':
          compare = a.state.localeCompare(b.state)
          break
        case 'started':
          // Simple string compare for demo - would use real timestamps in production
          compare = a.started.localeCompare(b.started)
          break
      }
      return sortDirection === 'asc' ? compare : -compare
    })
  }, [jobs, sortBy, sortDirection])

  const effectivePerPage = limit === 'unlimited' ? 100 : limit
  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, needsPagination } = usePagination(sortedJobs, effectivePerPage)

  const getStateIcon = (state: string) => {
    switch (state) {
      case 'success': return <CheckCircle className="w-3.5 h-3.5 text-green-400" />
      case 'failure': return <XCircle className="w-3.5 h-3.5 text-red-400" />
      case 'pending': return <Clock className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
      case 'aborted': return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
      default: return <Clock className="w-3.5 h-3.5 text-gray-400" />
    }
  }

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      presubmit: 'bg-blue-500/20 text-blue-400',
      postsubmit: 'bg-green-500/20 text-green-400',
      periodic: 'bg-purple-500/20 text-purple-400',
    }
    return colors[type] || 'bg-gray-500/20 text-gray-400'
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-medium text-muted-foreground">Prow Jobs</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
            {jobs.length} jobs
          </span>
        </div>
        <CardControls
          limit={limit}
          onLimitChange={setLimit}
          sortBy={sortBy}
          sortOptions={[
            { value: 'name', label: 'Name' },
            { value: 'state', label: 'State' },
            { value: 'started', label: 'Started' },
          ]}
          onSortChange={setSortBy}
          sortDirection={sortDirection}
          onSortDirectionChange={setSortDirection}
        />
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-xs mb-4">
        <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-orange-400 font-medium">Prow Integration</p>
          <p className="text-muted-foreground">
            Connect to Prow for CI/CD job monitoring.{' '}
            <a href="https://docs.prow.k8s.io/docs/getting-started-deploy/" target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:underline">
              Install guide <ExternalLink className="w-3 h-3 inline" />
            </a>
          </p>
        </div>
      </div>

      {/* Jobs list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {paginatedItems.map((job, idx) => (
          <div key={idx} className="p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getStateIcon(job.state)}
                <span className="text-sm font-medium text-foreground truncate max-w-[200px]">{job.name}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${getTypeBadge(job.type)}`}>
                  {job.type}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">{job.started}</span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
              {job.pr !== '-' && <span>PR: {job.pr}</span>}
              <span>Duration: {job.duration}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {needsPagination && limit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={effectivePerPage}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
    </div>
  )
}

interface ProwStatusProps {
  config?: Record<string, unknown>
}

export function ProwStatus({ config: _config }: ProwStatusProps) {
  const { data: status, isLoading } = useDemoData(DEMO_PROW_STATUS)

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="rounded" height={100} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-medium text-muted-foreground">Prow Status</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${status.healthy ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
            {status.healthy ? 'Healthy' : 'Unhealthy'}
          </span>
        </div>
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-xs mb-4">
        <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-orange-400 font-medium">Prow Integration</p>
          <p className="text-muted-foreground">
            Connect to Prow for CI/CD metrics.{' '}
            <a href="https://docs.prow.k8s.io/docs/getting-started-deploy/" target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:underline">
              Install guide <ExternalLink className="w-3 h-3 inline" />
            </a>
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="text-2xl font-bold text-green-400">{status.successRate}%</div>
          <div className="text-xs text-muted-foreground">Success Rate</div>
        </div>
        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="text-2xl font-bold text-foreground">{status.prowJobsLastHour}</div>
          <div className="text-xs text-muted-foreground">Jobs (last hour)</div>
        </div>
        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-blue-400">{status.runningJobs}</div>
            <span className="text-xs text-muted-foreground">running</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-yellow-400">{status.pendingJobs}</div>
            <span className="text-xs text-muted-foreground">pending</span>
          </div>
        </div>
        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="text-2xl font-bold text-purple-400">{status.queuedJobs}</div>
          <div className="text-xs text-muted-foreground">Queued</div>
        </div>
      </div>

      {/* Version */}
      <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
        Prow {status.version}
      </div>
    </div>
  )
}

// Demo data for Prow history
const DEMO_PROW_HISTORY = [
  { name: 'pull-kubernetes-e2e', result: 'success', time: '10m ago' },
  { name: 'pull-kubernetes-unit', result: 'success', time: '15m ago' },
  { name: 'ci-kubernetes-e2e-gce', result: 'failure', time: '30m ago' },
  { name: 'post-kubernetes-push', result: 'success', time: '45m ago' },
  { name: 'pull-kubernetes-verify', result: 'success', time: '1h ago' },
  { name: 'ci-kubernetes-integration', result: 'failure', time: '1h 15m ago' },
  { name: 'pull-kubernetes-e2e', result: 'success', time: '1h 30m ago' },
  { name: 'periodic-kubernetes-soak', result: 'success', time: '2h ago' },
]

interface ProwHistoryProps {
  config?: Record<string, unknown>
}

export function ProwHistory({ config: _config }: ProwHistoryProps) {
  const { data: history, isLoading } = useDemoData(DEMO_PROW_HISTORY)
  const [limit, setLimit] = useState<number | 'unlimited'>(5)

  const effectivePerPage = limit === 'unlimited' ? 100 : limit
  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, needsPagination } = usePagination(history, effectivePerPage)

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-medium text-muted-foreground">Prow History</span>
        </div>
        <CardControls
          limit={limit}
          onLimitChange={setLimit}
        />
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-xs mb-4">
        <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-orange-400 font-medium">Prow Integration</p>
          <p className="text-muted-foreground">
            Connect to Prow for job history.{' '}
            <a href="https://docs.prow.k8s.io/docs/getting-started-deploy/" target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:underline">
              Install guide <ExternalLink className="w-3 h-3 inline" />
            </a>
          </p>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto relative">
        <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border" />
        <div className="space-y-2">
          {paginatedItems.map((entry, idx) => (
            <div key={idx} className="relative pl-6 group">
              <div className={`absolute left-0 top-2 w-4 h-4 rounded-full flex items-center justify-center ${
                entry.result === 'success' ? 'bg-green-500' : 'bg-red-500'
              }`}>
                {entry.result === 'success' ? (
                  <CheckCircle className="w-2.5 h-2.5 text-white" />
                ) : (
                  <XCircle className="w-2.5 h-2.5 text-white" />
                )}
              </div>
              <div className="p-2 rounded-lg bg-secondary/30">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground truncate">{entry.name}</span>
                  <span className="text-xs text-muted-foreground">{entry.time}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pagination */}
      {needsPagination && limit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={effectivePerPage}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
    </div>
  )
}

// =============================================================================
// LLM INFERENCE CARDS
// =============================================================================

const DEMO_LLM_SERVERS = [
  { name: 'vllm-llama3-70b', type: 'vLLM', model: 'Llama 3 70B', status: 'running', gpu: '4x A100', requests: '1.2K/min', latency: '45ms' },
  { name: 'tgi-mixtral-8x7b', type: 'TGI', model: 'Mixtral 8x7B', status: 'running', gpu: '2x A100', requests: '890/min', latency: '62ms' },
  { name: 'llm-d-codellama', type: 'LLM-d', model: 'CodeLlama 34B', status: 'running', gpu: '2x A100', requests: '456/min', latency: '38ms' },
  { name: 'vllm-phi3-mini', type: 'vLLM', model: 'Phi-3 Mini', status: 'scaling', gpu: '1x A10G', requests: '-', latency: '-' },
  { name: 'triton-embedding', type: 'Triton', model: 'E5-Large', status: 'running', gpu: '1x T4', requests: '2.4K/min', latency: '8ms' },
]

const DEMO_LLM_MODELS = [
  { name: 'Llama 3 70B', size: '140GB', gpuMem: '320GB', instances: 2, status: 'loaded' },
  { name: 'Mixtral 8x7B', size: '87GB', gpuMem: '176GB', instances: 1, status: 'loaded' },
  { name: 'CodeLlama 34B', size: '68GB', gpuMem: '140GB', instances: 1, status: 'loaded' },
  { name: 'Phi-3 Mini', size: '7.6GB', gpuMem: '16GB', instances: 0, status: 'downloading' },
  { name: 'E5-Large', size: '1.3GB', gpuMem: '4GB', instances: 3, status: 'loaded' },
]

interface LLMInferenceProps {
  config?: Record<string, unknown>
}

export function LLMInference({ config: _config }: LLMInferenceProps) {
  const { data: servers, isLoading } = useDemoData(DEMO_LLM_SERVERS)
  const [limit, setLimit] = useState<number | 'unlimited'>(5)

  const effectivePerPage = limit === 'unlimited' ? 100 : limit
  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, needsPagination } = usePagination(servers, effectivePerPage)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 flex items-center gap-1"><Play className="w-2.5 h-2.5" /> Running</span>
      case 'scaling':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 flex items-center gap-1"><RefreshCw className="w-2.5 h-2.5 animate-spin" /> Scaling</span>
      case 'stopped':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400 flex items-center gap-1"><Pause className="w-2.5 h-2.5" /> Stopped</span>
      default:
        return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400">{status}</span>
    }
  }

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      'vLLM': 'bg-purple-500/20 text-purple-400',
      'TGI': 'bg-blue-500/20 text-blue-400',
      'LLM-d': 'bg-cyan-500/20 text-cyan-400',
      'Triton': 'bg-green-500/20 text-green-400',
    }
    return colors[type] || 'bg-gray-500/20 text-gray-400'
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="rounded" height={50} />
        <Skeleton variant="rounded" height={50} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-muted-foreground">LLM Inference</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
            {servers.filter(s => s.status === 'running').length} running
          </span>
        </div>
        <CardControls limit={limit} onLimitChange={setLimit} />
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs mb-4">
        <AlertCircle className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-purple-400 font-medium">LLM Inference Detection</p>
          <p className="text-muted-foreground">
            Auto-detects vLLM, TGI, LLM-d, and Triton inference servers.{' '}
            <a href="https://docs.vllm.ai/en/latest/getting_started/installation.html" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
              vLLM docs <ExternalLink className="w-3 h-3 inline" />
            </a>
          </p>
        </div>
      </div>

      {/* Server list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {paginatedItems.map((server, idx) => (
          <div key={idx} className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{server.name}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${getTypeBadge(server.type)}`}>
                  {server.type}
                </span>
              </div>
              {getStatusBadge(server.status)}
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> {server.model}</span>
              <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> {server.gpu}</span>
            </div>
            {server.status === 'running' && (
              <div className="flex items-center gap-4 mt-2 text-xs">
                <span className="text-green-400">{server.requests}</span>
                <span className="text-blue-400">p50: {server.latency}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {needsPagination && limit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={effectivePerPage}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
    </div>
  )
}

interface LLMModelsProps {
  config?: Record<string, unknown>
}

export function LLMModels({ config: _config }: LLMModelsProps) {
  const { data: models, isLoading } = useDemoData(DEMO_LLM_MODELS)
  const [limit, setLimit] = useState<number | 'unlimited'>(5)

  const effectivePerPage = limit === 'unlimited' ? 100 : limit
  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, needsPagination } = usePagination(models, effectivePerPage)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'loaded':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">Loaded</span>
      case 'downloading':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 flex items-center gap-1"><RefreshCw className="w-2.5 h-2.5 animate-spin" /> Downloading</span>
      case 'error':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">Error</span>
      default:
        return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400">{status}</span>
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-medium text-muted-foreground">LLM Models</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
            {models.filter(m => m.status === 'loaded').length} loaded
          </span>
        </div>
        <CardControls limit={limit} onLimitChange={setLimit} />
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs mb-4">
        <AlertCircle className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-cyan-400 font-medium">Model Detection</p>
          <p className="text-muted-foreground">
            Scans for deployed LLM models across inference servers.
          </p>
        </div>
      </div>

      {/* Model list */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border/50">
              <th className="text-left py-2">Model</th>
              <th className="text-right py-2">Size</th>
              <th className="text-right py-2">GPU Mem</th>
              <th className="text-right py-2">Instances</th>
              <th className="text-right py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.map((model, idx) => (
              <tr key={idx} className="border-b border-border/30 hover:bg-secondary/30">
                <td className="py-2 font-medium text-foreground">{model.name}</td>
                <td className="py-2 text-right text-muted-foreground">{model.size}</td>
                <td className="py-2 text-right text-muted-foreground">{model.gpuMem}</td>
                <td className="py-2 text-right text-muted-foreground">{model.instances}</td>
                <td className="py-2 text-right">{getStatusBadge(model.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {needsPagination && limit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={effectivePerPage}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
    </div>
  )
}

// =============================================================================
// ML TRAINING CARDS
// =============================================================================

const DEMO_ML_JOBS = [
  { name: 'train-gpt-finetune', framework: 'PyTorch', status: 'running', gpus: 8, progress: 67, eta: '2h 15m' },
  { name: 'eval-llama-benchmark', framework: 'Ray', status: 'running', gpus: 4, progress: 89, eta: '25m' },
  { name: 'pretrain-vision-model', framework: 'JAX', status: 'queued', gpus: 16, progress: 0, eta: '-' },
  { name: 'rlhf-reward-model', framework: 'DeepSpeed', status: 'running', gpus: 8, progress: 34, eta: '5h 45m' },
  { name: 'inference-optimization', framework: 'TensorRT', status: 'completed', gpus: 2, progress: 100, eta: '-' },
]

const DEMO_NOTEBOOKS = [
  { name: 'research-experiments', user: 'alice', status: 'running', cpu: '4 cores', memory: '16GB', gpu: '1x T4', lastActive: '2m ago' },
  { name: 'model-analysis', user: 'bob', status: 'running', cpu: '8 cores', memory: '32GB', gpu: '1x A10G', lastActive: '15m ago' },
  { name: 'data-preprocessing', user: 'charlie', status: 'idle', cpu: '2 cores', memory: '8GB', gpu: '-', lastActive: '2h ago' },
  { name: 'benchmark-suite', user: 'alice', status: 'running', cpu: '4 cores', memory: '16GB', gpu: '1x T4', lastActive: '5m ago' },
]

interface MLJobsProps {
  config?: Record<string, unknown>
}

export function MLJobs({ config: _config }: MLJobsProps) {
  const { data: jobs, isLoading } = useDemoData(DEMO_ML_JOBS)
  const [limit, setLimit] = useState<number | 'unlimited'>(5)

  const effectivePerPage = limit === 'unlimited' ? 100 : limit
  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, needsPagination } = usePagination(jobs, effectivePerPage)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 flex items-center gap-1"><Play className="w-2.5 h-2.5" /> Running</span>
      case 'queued':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> Queued</span>
      case 'completed':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5" /> Done</span>
      case 'failed':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 flex items-center gap-1"><XCircle className="w-2.5 h-2.5" /> Failed</span>
      default:
        return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400">{status}</span>
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="rounded" height={60} />
        <Skeleton variant="rounded" height={60} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-400" />
          <span className="text-sm font-medium text-muted-foreground">ML Training Jobs</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
            {jobs.filter(j => j.status === 'running').length} running
          </span>
        </div>
        <CardControls limit={limit} onLimitChange={setLimit} />
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs mb-4">
        <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-yellow-400 font-medium">ML Job Detection</p>
          <p className="text-muted-foreground">
            Auto-detects Kubeflow, Ray, and custom ML training jobs.{' '}
            <a href="https://www.kubeflow.org/docs/started/installing-kubeflow/" target="_blank" rel="noopener noreferrer" className="text-yellow-400 hover:underline">
              Kubeflow docs <ExternalLink className="w-3 h-3 inline" />
            </a>
          </p>
        </div>
      </div>

      {/* Jobs list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {paginatedItems.map((job, idx) => (
          <div key={idx} className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{job.name}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                  {job.framework}
                </span>
              </div>
              {getStatusBadge(job.status)}
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
              <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> {job.gpus} GPUs</span>
              {job.eta !== '-' && <span>ETA: {job.eta}</span>}
            </div>
            {job.status === 'running' && (
              <div className="w-full bg-secondary rounded-full h-1.5">
                <div
                  className="bg-gradient-to-r from-yellow-500 to-green-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {needsPagination && limit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={effectivePerPage}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
    </div>
  )
}

interface MLNotebooksProps {
  config?: Record<string, unknown>
}

export function MLNotebooks({ config: _config }: MLNotebooksProps) {
  const { data: notebooks, isLoading } = useDemoData(DEMO_NOTEBOOKS)
  const [limit, setLimit] = useState<number | 'unlimited'>(5)

  const effectivePerPage = limit === 'unlimited' ? 100 : limit
  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, needsPagination } = usePagination(notebooks, effectivePerPage)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">Active</span>
      case 'idle':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">Idle</span>
      case 'stopped':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400">Stopped</span>
      default:
        return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400">{status}</span>
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Notebook className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-muted-foreground">Jupyter Notebooks</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
            {notebooks.filter(n => n.status === 'running').length} active
          </span>
        </div>
        <CardControls limit={limit} onLimitChange={setLimit} />
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs mb-4">
        <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-blue-400 font-medium">Notebook Detection</p>
          <p className="text-muted-foreground">
            Scans for JupyterHub and standalone notebook servers.{' '}
            <a href="https://jupyterhub.readthedocs.io/en/stable/getting-started/index.html" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
              JupyterHub docs <ExternalLink className="w-3 h-3 inline" />
            </a>
          </p>
        </div>
      </div>

      {/* Notebook list */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border/50">
              <th className="text-left py-2">Notebook</th>
              <th className="text-left py-2">User</th>
              <th className="text-right py-2">Resources</th>
              <th className="text-right py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.map((nb, idx) => (
              <tr key={idx} className="border-b border-border/30 hover:bg-secondary/30">
                <td className="py-2 font-medium text-foreground">{nb.name}</td>
                <td className="py-2 text-muted-foreground">{nb.user}</td>
                <td className="py-2 text-right text-xs text-muted-foreground">
                  {nb.cpu} / {nb.memory} {nb.gpu !== '-' && `/ ${nb.gpu}`}
                </td>
                <td className="py-2 text-right">{getStatusBadge(nb.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {needsPagination && limit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={effectivePerPage}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
    </div>
  )
}
