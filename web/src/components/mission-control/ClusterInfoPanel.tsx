import type { ClusterHoverInfo } from './svg/ClusterZone'
import { GaugeRow } from './BlueprintInfoPanelsShared'
import { TechnicalAcronym } from '../shared/TechnicalAcronym'

// ---------------------------------------------------------------------------
// ClusterInfoPanel
// ---------------------------------------------------------------------------

/** Format large numbers nicely: 13590.945 → "13,591" */
function fmtNum(v: number | undefined): string {
  if (v == null) return '—'
  return Math.round(v).toLocaleString()
}

export function ClusterInfoPanel({ info }: { info: ClusterHoverInfo }) {
  return (
    <>
      <div>
        <h3 className="text-base font-bold text-foreground">{info.name}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {info.provider.toUpperCase()}
          {info.nodeCount != null ? ` · ${info.nodeCount} nodes` : ''}
          {info.podCount != null ? ` · ${info.podCount} pods` : ''}
        </p>
      </div>

      <div>
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Resources</h4>
        <div className="space-y-3">
          <GaugeRow label="CPU" value={info.cpuUsage} max={info.cpuCores} unit=" cores" />
          <GaugeRow label="Memory" value={info.memUsage} max={info.memGB != null ? Math.round(info.memGB) : undefined} unit=" GB" />
          <GaugeRow label="Storage" value={undefined} max={info.storageGB != null ? Math.round(info.storageGB) : undefined} unit=" GB" />
        </div>
      </div>

      <div>
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Capacity</h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground"><TechnicalAcronym term="CPU">CPU</TechnicalAcronym></span>
            <span className="text-foreground tabular-nums">{fmtNum(info.cpuCores)} cores</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Memory</span>
            <span className="text-foreground tabular-nums">{fmtNum(info.memGB)} GB</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Storage</span>
            <span className="text-foreground tabular-nums">{fmtNum(info.storageGB)} GB</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground"><TechnicalAcronym term="PVC">PVC</TechnicalAcronym></span>
            <span className="text-foreground tabular-nums">{info.pvcBoundCount ?? '?'}/{info.pvcCount ?? '?'}</span>
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Accelerators</h4>
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center rounded-lg bg-slate-800/50 py-2">
            <div className="text-base font-bold text-foreground">{info.gpuCount ?? '—'}</div>
            <div className="text-[10px] text-muted-foreground">GPU</div>
          </div>
          <div className="text-center rounded-lg bg-slate-800/50 py-2">
            <div className="text-base font-bold text-foreground">{info.tpuCount ?? '—'}</div>
            <div className="text-[10px] text-muted-foreground">TPU</div>
          </div>
          <div className="text-center rounded-lg bg-slate-800/50 py-2">
            <div className="text-base font-bold text-foreground">—</div>
            <div className="text-[10px] text-muted-foreground">XPU</div>
          </div>
        </div>
      </div>
    </>
  )
}
