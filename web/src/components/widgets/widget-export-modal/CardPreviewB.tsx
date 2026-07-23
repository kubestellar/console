/**
 * Secondary card preview renderers for widget export modal previews.
 */

import type { WidgetCardDefinition } from '../../../lib/widgets/widgetRegistry'
import { TechnicalAcronym } from '../../shared/TechnicalAcronym'
import {
  PREV_BAR_CLOSED_BASE,
  PREV_BAR_CLOSED_SCALE,
  PREV_BAR_GAP,
  PREV_BAR_OPENED_SCALE,
  PREV_BORDER_THIN,
  PREV_CARD_PAD,
  PREV_CLR_CPU,
  PREV_CLR_MEM,
  PREV_CLR_MUTED,
  PREV_CLR_SECONDARY,
  PREV_DOTS_GAP,
  PREV_FS_BODY,
  PREV_FS_CAPTION,
  PREV_FS_FEATURED,
  PREV_FS_HEADLINE,
  PREV_FS_LABEL,
  PREV_FS_MICRO,
  PREV_FS_STAT,
  PREV_FS_STAT_SM,
  PREV_HAIRLINE_GAP,
  PREV_LG,
  PREV_SM,
  PREV_XS,
  WIDGET_EXPORT_MODAL_DIV_STYLE_2,
  WIDGET_EXPORT_MODAL_SPAN_STYLE_2,
  WIDGET_EXPORT_MODAL_SPAN_STYLE_3,
  WIDGET_EXPORT_MODAL_SPAN_STYLE_4,
  ps,
} from './previewStyles'

export function CardPreviewB({ cardType, card }: { cardType: string; card: WidgetCardDefinition }) {
  switch (cardType) {
      case 'workflow_matrix':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> Workflow Matrix</div>
            <div style={ps.col}>
              {['build', 'test', 'lint', 'deploy'].map((wf) => (
                <div key={wf} style={{ ...ps.row, justifyContent: 'space-between', fontSize: PREV_FS_CAPTION }}>
                  <span style={WIDGET_EXPORT_MODAL_SPAN_STYLE_2}>{wf}</span>
                  <div style={{ display: 'flex', gap: PREV_DOTS_GAP }}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: i === 3 && wf === 'deploy' ? ps.colors.error : ps.colors.healthy }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )

      case 'pipeline_flow':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> Live Runs</div>
            <div style={ps.col}>
              {[
                { name: 'build (amd64)', status: 'running', time: '3m 12s' },
                { name: 'fullstack-smoke', status: 'queued', time: 'queued' },
                { name: 'coverage-gate', status: 'success', time: '24s' },
              ].map((r) => (
                <div key={r.name} className="px-2 py-1" style={{ ...ps.row, justifyContent: 'space-between', fontSize: PREV_FS_CAPTION, backgroundColor: 'rgba(30,41,59,0.5)', borderRadius: PREV_XS }}>
                  <span style={ps.dot(r.status === 'running' ? ps.colors.info : r.status === 'success' ? ps.colors.healthy : PREV_CLR_MUTED)} />
                  <span style={WIDGET_EXPORT_MODAL_SPAN_STYLE_3}>{r.name}</span>
                  <span style={{ color: PREV_CLR_MUTED, fontSize: PREV_FS_MICRO }}>{r.time}</span>
                </div>
              ))}
            </div>
          </div>
        )

      case 'recent_failures':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.error)} /> Recent Failures</div>
            <div style={ps.col}>
              {[
                { wf: 'nightly-test-suite', step: 'e2e-tests', ago: '2h ago' },
                { wf: 'build', step: 'lint', ago: '5h ago' },
              ].map((f) => (
                <div key={f.wf} className="px-2 py-1" style={{ ...ps.row, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: PREV_XS, borderLeft: `${PREV_BORDER_THIN} solid ${ps.colors.error}` }}>
                  <div style={WIDGET_EXPORT_MODAL_DIV_STYLE_2}>
                    <div style={{ fontSize: PREV_FS_CAPTION, fontWeight: 600, color: ps.colors.error }}>{f.wf}</div>
                    <div style={{ fontSize: PREV_FS_MICRO, color: PREV_CLR_MUTED }}>Failed at: {f.step}</div>
                  </div>
                  <span style={{ fontSize: PREV_FS_MICRO, color: PREV_CLR_MUTED }}>{f.ago}</span>
                </div>
              ))}
            </div>
          </div>
        )

      case 'issue_activity_chart':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> Daily Issues &amp; PRs</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: PREV_BAR_GAP, height: '60px', marginBottom: PREV_SM }}>
              {[4, 7, 3, 8, 5, 6, 9, 2, 5, 7, 4, 6, 3].map((v, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: PREV_HAIRLINE_GAP, justifyContent: 'flex-end', height: '100%' }}>
                  <div style={{ height: `${v * PREV_BAR_OPENED_SCALE}px`, backgroundColor: ps.colors.info, borderRadius: '1px', opacity: 0.7 }} />
                  <div style={{ height: `${Math.max(0, (PREV_BAR_CLOSED_BASE - v) * PREV_BAR_CLOSED_SCALE)}px`, backgroundColor: ps.colors.healthy, borderRadius: '1px', opacity: 0.5 }} />
                </div>
              ))}
            </div>
            <div style={ps.row}>
              <div style={ps.statBlock}><span style={{ ...ps.statVal, fontSize: PREV_FS_BODY, color: ps.colors.info }}>23</span><span style={ps.statLbl}>Opened</span></div>
              <div style={ps.statBlock}><span style={{ ...ps.statVal, fontSize: PREV_FS_BODY, color: ps.colors.healthy }}>18</span><span style={ps.statLbl}>Closed</span></div>
              <div style={ps.statBlock}><span style={{ ...ps.statVal, fontSize: PREV_FS_BODY, color: ps.colors.purple }}>12</span><span style={ps.statLbl}>Merged</span></div>
            </div>
          </div>
        )

      case 'github_ci_monitor':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> GitHub CI Monitor</div>
            <div style={{ textAlign: 'center', marginBottom: PREV_SM }}>
              <div style={{ fontSize: PREV_FS_HEADLINE, fontWeight: 700, color: ps.colors.healthy }}>94%</div>
              <div style={ps.muted}>Pass rate (7d)</div>
            </div>
            <div style={ps.row}>
              <div style={ps.statBlock}><span style={{ ...ps.statVal, fontSize: PREV_FS_BODY }}>156</span><span style={ps.statLbl}>Runs</span></div>
              <div style={ps.statBlock}><span style={{ ...ps.statVal, fontSize: PREV_FS_BODY, color: ps.colors.healthy }}>147</span><span style={ps.statLbl}>Passed</span></div>
              <div style={ps.statBlock}><span style={{ ...ps.statVal, fontSize: PREV_FS_BODY, color: ps.colors.error }}>9</span><span style={ps.statLbl}>Failed</span></div>
            </div>
          </div>
        )

      case 'github_activity':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> GitHub Activity</div>
            <div style={ps.col}>
              {[
                { label: 'PRs merged (7d)', value: '24', color: ps.colors.purple },
                { label: 'Issues opened', value: '8', color: ps.colors.info },
                { label: 'Contributors', value: '6', color: ps.colors.healthy },
                { label: 'Latest release', value: 'v0.3.22', color: PREV_CLR_SECONDARY },
              ].map((item) => (
                <div key={item.label} style={{ ...ps.row, justifyContent: 'space-between', fontSize: PREV_FS_CAPTION }}>
                  <span style={{ color: PREV_CLR_MUTED }}>{item.label}</span>
                  <span style={{ fontWeight: 600, color: item.color }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )

      case 'cluster_metrics':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> Cluster Metrics</div>
            <div style={ps.row}>
              <div style={ps.statBlock}>
                <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT_SM, color: PREV_CLR_CPU }}>62%</span>
                <span style={ps.statLbl}><TechnicalAcronym term="CPU">CPU</TechnicalAcronym></span>
              </div>
              <div style={ps.statBlock}>
                <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT_SM, color: PREV_CLR_MEM }}>78%</span>
                <span style={ps.statLbl}>Memory</span>
              </div>
              <div style={ps.statBlock}>
                <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT_SM, color: ps.colors.healthy }}>45</span>
                <span style={ps.statLbl}>Pods</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: PREV_DOTS_GAP, height: '40px', marginTop: PREV_SM }}>
              {[40, 55, 62, 58, 70, 65, 72, 68, 75, 62].map((v, i) => (
                <div key={i} style={{ flex: 1, height: `${v * 0.55}px`, backgroundColor: ps.colors.info, borderRadius: '1px', opacity: 0.6 }} />
              ))}
            </div>
          </div>
        )

      case 'workload_status':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> Workload Status</div>
            <div style={ps.col}>
              {[
                { name: 'Deployments', running: 12, total: 14, color: ps.colors.healthy },
                { name: 'StatefulSets', running: 3, total: 3, color: ps.colors.healthy },
                { name: 'DaemonSets', running: 4, total: 5, color: ps.colors.warning },
              ].map((w) => (
                <div key={w.name} className="px-2 py-1" style={{ ...ps.row, justifyContent: 'space-between', fontSize: PREV_FS_CAPTION }}>
                  <span style={WIDGET_EXPORT_MODAL_SPAN_STYLE_2}>{w.name}</span>
                  <span style={{ color: w.running === w.total ? ps.colors.healthy : ps.colors.warning }}>
                    {w.running}/{w.total} ready
                  </span>
                </div>
              ))}
            </div>
          </div>
        )

      case 'app_status':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> Application Status</div>
            <div style={ps.col}>
              {[
                { name: 'frontend', clusters: 3, status: 'healthy' },
                { name: 'api-gateway', clusters: 2, status: 'healthy' },
                { name: 'worker', clusters: 2, status: 'degraded' },
                { name: 'scheduler', clusters: 1, status: 'healthy' },
              ].map((a) => (
                <div key={a.name} style={{ ...ps.row, justifyContent: 'space-between', fontSize: PREV_FS_CAPTION }}>
                  <span style={WIDGET_EXPORT_MODAL_SPAN_STYLE_2}>{a.name}</span>
                  <span style={{ color: PREV_CLR_MUTED, fontSize: PREV_FS_MICRO }}>{a.clusters} clusters</span>
                  <span style={ps.dot(a.status === 'healthy' ? ps.colors.healthy : ps.colors.warning)} />
                </div>
              ))}
            </div>
          </div>
        )

      case 'namespace_overview':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> Namespace Overview</div>
            <div style={ps.col}>
              {[
                { ns: 'default', pods: 12, deploys: 4 },
                { ns: 'kube-system', pods: 24, deploys: 8 },
                { ns: 'monitoring', pods: 6, deploys: 3 },
                { ns: 'production', pods: 18, deploys: 6 },
              ].map((n) => (
                <div key={n.ns} className="px-2 py-1" style={{ ...ps.row, justifyContent: 'space-between', fontSize: PREV_FS_CAPTION }}>
                  <span style={{ fontWeight: 500, color: PREV_CLR_CPU }}>{n.ns}</span>
                  <span style={{ color: PREV_CLR_MUTED }}>{n.pods} pods</span>
                  <span style={{ color: PREV_CLR_MUTED }}>{n.deploys} deploys</span>
                </div>
              ))}
            </div>
          </div>
        )

      case 'console_ai_health_check':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> AI Health Check</div>
            <div style={{ textAlign: 'center', marginBottom: PREV_SM }}>
              <div style={{ fontSize: PREV_FS_FEATURED, fontWeight: 700, color: ps.colors.healthy }}>Healthy</div>
              <div style={ps.muted}>AI analysis complete</div>
            </div>
            <div style={ps.col}>
              {[
                { finding: 'All nodes responding', severity: 'ok' },
                { finding: 'Pod restart rate normal', severity: 'ok' },
                { finding: 'Memory pressure on worker-2', severity: 'warn' },
              ].map((f) => (
                <div key={f.finding} className="px-2 py-1" style={{ ...ps.row, fontSize: PREV_FS_CAPTION }}>
                  <span style={ps.dot(f.severity === 'ok' ? ps.colors.healthy : ps.colors.warning)} />
                  <span style={{ color: f.severity === 'ok' ? PREV_CLR_SECONDARY : ps.colors.warning }}>{f.finding}</span>
                </div>
              ))}
            </div>
          </div>
        )

      case 'console_ai_offline_detection':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.warning)} /> AI Offline Detection</div>
            <div style={ps.row}>
              <div style={ps.statBlock}>
                <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: ps.colors.healthy }}>11</span>
                <span style={ps.statLbl}>Online</span>
              </div>
              <div style={ps.statBlock}>
                <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: ps.colors.error }}>1</span>
                <span style={ps.statLbl}>Offline</span>
              </div>
              <div style={ps.statBlock}>
                <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: ps.colors.warning }}>2</span>
                <span style={ps.statLbl}>GPUs down</span>
              </div>
            </div>
            <div className="px-2 py-1" style={{ ...ps.row, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: PREV_XS, borderLeft: `${PREV_BORDER_THIN} solid ${ps.colors.error}`, marginTop: PREV_SM }}>
              <span style={{ fontSize: PREV_FS_CAPTION, color: ps.colors.error, fontWeight: 600 }}>worker-4</span>
              <span style={{ fontSize: PREV_FS_MICRO, color: PREV_CLR_MUTED, marginLeft: 'auto' }}>unreachable 12m</span>
            </div>
          </div>
        )

      default:
        return <GenericCardPreview card={card} />
  }
}

export function GenericCardPreview({ card }: { card: WidgetCardDefinition }) {
  const categoryData: Record<string, { dot: string; items: { label: string; value: string; color?: string }[] }> = {
    cluster: { dot: ps.colors.healthy, items: [{ label: 'Ready', value: '3/4', color: ps.colors.healthy }, { label: 'Nodes', value: '12' }, { label: 'Version', value: 'v1.28' }] },
    workload: { dot: ps.colors.info, items: [{ label: 'Running', value: '45', color: ps.colors.healthy }, { label: 'Pending', value: '2', color: ps.colors.warning }, { label: 'Failed', value: '1', color: ps.colors.error }] },
    gpu: { dot: ps.colors.purple, items: [{ label: 'Total', value: '32' }, { label: 'Allocated', value: '24', color: ps.colors.purple }, { label: 'Available', value: '8', color: ps.colors.healthy }] },
    security: { dot: ps.colors.warning, items: [{ label: 'Critical', value: '2', color: ps.colors.error }, { label: 'Warning', value: '5', color: ps.colors.warning }, { label: 'Info', value: '8', color: ps.colors.info }] },
    monitoring: { dot: ps.colors.info, items: [{ label: 'Active', value: '3', color: ps.colors.info }, { label: 'Resolved', value: '12', color: ps.colors.healthy }, { label: 'Silenced', value: '1' }] },
    'ci-cd': { dot: ps.colors.info, items: [{ label: 'Runs', value: '36', color: ps.colors.info }, { label: 'Passed', value: '34', color: ps.colors.healthy }, { label: 'Failed', value: '2', color: ps.colors.error }] } }
  const data = categoryData[card.category] || categoryData.monitoring
  return (
    <div style={ps.card}>
      <div style={ps.title}><span style={ps.dot(data.dot)} /> {card.displayName}</div>
      <div style={ps.row}>
        {data.items.map((item) => (
          <div key={item.label} style={ps.statBlock}>
            <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: item.color || '#f9fafb' }}>{item.value}</span>
            <span style={ps.statLbl}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function NightlyE2EPreview() {
  const platforms = [
    {
      name: 'OCP', color: '#f97316',
      guides: [
        { acronym: 'IS', dots: ['g','g','r','g','g','g','g'] },
        { acronym: 'PD', dots: ['g','g','g','g','g','g','g'] },
        { acronym: 'PPC', dots: ['g','r','g','g','g','r','g'] },
        { acronym: 'TPC', dots: ['g','g','g','r','g','g','g'] },
        { acronym: 'WEP', dots: ['g','g','g','g','g','g','b'] },
        { acronym: 'WVA', dots: ['g','r','g','g','r','g','g'] },
      ] },
    {
      name: 'GKE', color: '#3b82f6',
      guides: [
        { acronym: 'IS', dots: ['g','g','g','g','g','g','g'] },
        { acronym: 'PD', dots: ['r','g','g','g','g','g','g'] },
        { acronym: 'WEP', dots: ['g','g','g','g','g','g','g'] },
      ] },
    {
      name: 'CKS', color: '#a855f7',
      guides: [
        { acronym: 'IS', dots: [] as string[] },
        { acronym: 'PD', dots: [] as string[] },
        { acronym: 'WEP', dots: [] as string[] },
      ] },
  ]
  const dotColor: Record<string, string> = { g: '#22c55e', r: '#ef4444', b: '#60a5fa' }

  return (
    <div style={{ ...ps.card, width: 320, fontSize: PREV_FS_CAPTION, padding: PREV_CARD_PAD }}>
      <div style={ps.title}><span style={ps.dot('#22c55e')} /> Nightly E2E Status</div>
      <div style={{ display: 'flex', gap: PREV_LG, marginBottom: PREV_SM }}>
        <div><span style={{ fontSize: PREV_FS_STAT, fontWeight: 700, color: '#a855f7' }}>87%</span><div style={ps.muted}>Pass Rate</div></div>
        <div><span style={{ fontSize: PREV_FS_STAT, fontWeight: 700 }}>16</span><div style={ps.muted}>Guides</div></div>
        <div><span style={{ fontSize: PREV_FS_STAT, fontWeight: 700, color: '#ef4444' }}>3</span><div style={ps.muted}>Failing</div></div>
      </div>
      {platforms.map((p) => (
        <div key={p.name} className="mb-1">
          <div className="mb-1" style={{ color: p.color, fontWeight: 600, fontSize: PREV_FS_MICRO }}>{p.name}</div>
          {p.guides.map((g) => (
            <div key={`${p.name}-${g.acronym}`} className="flex items-center gap-1" style={{ marginBottom: PREV_HAIRLINE_GAP }}>
              <span style={WIDGET_EXPORT_MODAL_SPAN_STYLE_4}>{g.acronym}</span>
              <div style={{ display: 'flex', gap: PREV_DOTS_GAP }}>
                {g.dots.length > 0 ? g.dots.map((d, i) => (
                  <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: dotColor[d], display: 'inline-block', ...(d === 'b' ? { animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' } : {}) }} />
                )) : (
                  <span style={{ color: PREV_CLR_MUTED, fontSize: PREV_FS_LABEL }}>no runs</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
