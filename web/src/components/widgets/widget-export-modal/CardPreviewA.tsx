/**
 * Primary card preview renderers for widget export modal previews.
 */

import { useTranslation } from 'react-i18next'
import type { WidgetCardDefinition } from '../../../lib/widgets/widgetRegistry'
import {
  PREV_BORDER_STD,
  PREV_BORDER_THIN,
  PREV_CLR_CPU,
  PREV_CLR_MEM,
  PREV_CLR_MUTED,
  PREV_CLR_SECONDARY,
  PREV_FS_BODY,
  PREV_FS_CAPTION,
  PREV_FS_FEATURED,
  PREV_FS_HEADLINE,
  PREV_FS_HERO,
  PREV_FS_MICRO,
  PREV_FS_STAT,
  PREV_FS_STAT_SM,
  PREV_SM,
  PREV_XS,
  WIDGET_EXPORT_MODAL_SPAN_STYLE_1,
  WIDGET_EXPORT_MODAL_SPAN_STYLE_2,
  ps,
} from './previewStyles'
import { NightlyE2EPreview } from './CardPreviewB'

export function CardPreviewA({ cardType, card }: { cardType: string; card: WidgetCardDefinition }) {
  const { t } = useTranslation()

  switch (cardType) {
      case 'cluster_health':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.warning)} /> Cluster Health</div>
            <div style={ps.row}>
              <div style={{ ...ps.statBlock, borderLeft: `${PREV_BORDER_THIN} solid ${ps.colors.healthy}` }}>
                <span style={{ ...ps.statVal, color: ps.colors.healthy }}>3</span>
                <span style={ps.statLbl}>{t('common.healthy')}</span>
              </div>
              <div style={{ ...ps.statBlock, borderLeft: `${PREV_BORDER_THIN} solid ${ps.colors.error}` }}>
                <span style={{ ...ps.statVal, color: ps.colors.error }}>1</span>
                <span style={ps.statLbl}>{t('common.unhealthy')}</span>
              </div>
            </div>
          </div>
        )

      case 'pod_issues':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.warning)} /> Pod Issues</div>
            <div style={ps.muted}>4 total issues</div>
            <div style={{ ...ps.col, marginTop: PREV_SM }}>
              <div className="px-2 py-1" style={{ ...ps.row, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: PREV_XS }}>
                <span style={{ color: ps.colors.error, fontWeight: 600, fontSize: PREV_FS_BODY }}>2</span>
                <span style={ps.muted}>CrashLoopBackOff</span>
              </div>
              <div className="px-2 py-1" style={{ ...ps.row, backgroundColor: 'rgba(234,179,8,0.1)', borderRadius: PREV_XS }}>
                <span style={{ color: ps.colors.warning, fontWeight: 600, fontSize: PREV_FS_BODY }}>1</span>
                <span style={ps.muted}>OOMKilled</span>
              </div>
              <div className="px-2 py-1" style={{ ...ps.row, backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: PREV_XS }}>
                <span style={{ color: ps.colors.info, fontWeight: 600, fontSize: PREV_FS_BODY }}>1</span>
                <span style={ps.muted}>ImagePullBackOff</span>
              </div>
            </div>
          </div>
        )

      case 'gpu_overview':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.purple)} /> GPU Overview</div>
            <div style={{ textAlign: 'center', marginBottom: PREV_SM }}>
              <div style={{ fontSize: PREV_FS_HERO, fontWeight: 700, color: ps.colors.purple }}>72%</div>
              <div style={ps.muted}>{t('common.utilization')}</div>
            </div>
            <div style={ps.row}>
              <div style={ps.statBlock}>
                <span style={ps.statVal}>32</span>
                <span style={ps.statLbl}>{t('common.total')}</span>
              </div>
              <div style={ps.statBlock}>
                <span style={{ ...ps.statVal, color: ps.colors.purple }}>23</span>
                <span style={ps.statLbl}>{t('common.allocated')}</span>
              </div>
            </div>
          </div>
        )

      case 'hardware_health':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.warning)} /> Hardware Health</div>
            <div style={{ ...ps.row, marginBottom: PREV_SM }}>
              <div style={{ ...ps.statBlock, borderLeft: `${PREV_BORDER_STD} solid ${ps.colors.healthy}` }}>
                <span style={ps.statVal}>4</span>
                <span style={ps.statLbl}>{t('common.nodes')}</span>
              </div>
              <div style={{ ...ps.statBlock, borderLeft: `${PREV_BORDER_STD} solid ${ps.colors.purple}` }}>
                <span style={{ ...ps.statVal, color: ps.colors.purple }}>16</span>
                <span style={ps.statLbl}>{t('common.gpus')}</span>
              </div>
              <div style={{ ...ps.statBlock, borderLeft: `${PREV_BORDER_STD} solid ${ps.colors.info}` }}>
                <span style={{ ...ps.statVal, color: ps.colors.info }}>8</span>
                <span style={ps.statLbl}>NICs</span>
              </div>
            </div>
            <div style={ps.col}>
              <div style={{ fontSize: PREV_FS_MICRO, fontWeight: 600, color: PREV_CLR_MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Alerts (2)</div>
              <div className="px-2 py-1" style={{ ...ps.row, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: PREV_XS, borderLeft: `${PREV_BORDER_STD} solid ${ps.colors.error}` }}>
                <span style={{ fontSize: PREV_FS_CAPTION, color: ps.colors.error, fontWeight: 600 }}>GPU</span>
                <span style={{ fontSize: PREV_FS_MICRO, color: PREV_CLR_MUTED, marginLeft: PREV_XS }}>worker-3 (-2)</span>
              </div>
              <div className="px-2 py-1" style={{ ...ps.row, backgroundColor: 'rgba(234,179,8,0.1)', borderRadius: PREV_XS, borderLeft: `${PREV_BORDER_STD} solid ${ps.colors.warning}` }}>
                <span style={{ fontSize: PREV_FS_CAPTION, color: ps.colors.warning, fontWeight: 600 }}>NIC</span>
                <span style={{ fontSize: PREV_FS_MICRO, color: PREV_CLR_MUTED, marginLeft: PREV_XS }}>worker-1 (-1)</span>
              </div>
            </div>
          </div>
        )

      case 'nightly_e2e_status':
        return <NightlyE2EPreview />

      case 'security_issues':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.warning)} /> Security Issues</div>
            <div style={ps.col}>
              {[
                { label: 'Privileged containers', count: 3, color: ps.colors.error },
                { label: 'No resource limits', count: 12, color: ps.colors.warning },
                { label: 'Running as root', count: 5, color: ps.colors.error },
              ].map((item) => (
                <div key={item.label} className="px-2 py-1" style={{ ...ps.row, backgroundColor: item.color === ps.colors.error ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)', borderRadius: PREV_XS }}>
                  <span style={{ color: item.color, fontWeight: 600, fontSize: PREV_FS_BODY, minWidth: '16px' }}>{item.count}</span>
                  <span style={ps.muted}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )

      case 'active_alerts':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.error)} /> Active Alerts</div>
            <div style={ps.col}>
              {[
                { name: 'HighMemoryUsage', severity: 'critical', ns: 'monitoring' },
                { name: 'PodCrashLooping', severity: 'warning', ns: 'default' },
                { name: 'NodeDiskPressure', severity: 'warning', ns: 'kube-system' },
              ].map((a) => (
                <div key={a.name} className="px-2 py-1" style={{ ...ps.row, backgroundColor: a.severity === 'critical' ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)', borderRadius: PREV_XS, borderLeft: `${PREV_BORDER_STD} solid ${a.severity === 'critical' ? ps.colors.error : ps.colors.warning}` }}>
                  <span style={{ fontSize: PREV_FS_CAPTION, color: a.severity === 'critical' ? ps.colors.error : ps.colors.warning, fontWeight: 600 }}>{a.name}</span>
                  <span style={{ fontSize: PREV_FS_MICRO, color: PREV_CLR_MUTED, marginLeft: 'auto' }}>{a.ns}</span>
                </div>
              ))}
            </div>
          </div>
        )

      case 'helm_releases':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> Helm Releases</div>
            <div style={ps.col}>
              {[
                { name: 'ingress-nginx', status: 'deployed', ver: '4.8.3' },
                { name: 'cert-manager', status: 'deployed', ver: '1.13.2' },
                { name: 'prometheus', status: 'deployed', ver: '25.8.0' },
                { name: 'redis', status: 'failed', ver: '18.4.0' },
              ].map((r) => (
                <div key={r.name} style={{ ...ps.row, justifyContent: 'space-between' }}>
                  <span style={{ fontSize: PREV_FS_CAPTION, fontWeight: 500 }}>{r.name}</span>
                  <span style={{ fontSize: PREV_FS_MICRO, color: r.status === 'deployed' ? ps.colors.healthy : ps.colors.error }}>{r.status}</span>
                  <span style={{ fontSize: PREV_FS_MICRO, color: PREV_CLR_MUTED }}>{r.ver}</span>
                </div>
              ))}
            </div>
          </div>
        )

      case 'top_pods':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> Top Pods</div>
            <div style={ps.col}>
              {[
                { name: 'ml-training-job-7x', cpu: '3.2 cores', mem: '12.4 Gi' },
                { name: 'prometheus-server-0', cpu: '1.8 cores', mem: '8.2 Gi' },
                { name: 'elasticsearch-data-1', cpu: '1.4 cores', mem: '6.1 Gi' },
              ].map((p) => (
                <div key={p.name} style={{ ...ps.row, justifyContent: 'space-between', fontSize: PREV_FS_CAPTION }}>
                  <span style={WIDGET_EXPORT_MODAL_SPAN_STYLE_1}>{p.name}</span>
                  <span style={{ color: PREV_CLR_CPU }}>{p.cpu}</span>
                  <span style={{ color: PREV_CLR_MEM }}>{p.mem}</span>
                </div>
              ))}
            </div>
          </div>
        )

      case 'event_summary':
      case 'warning_events':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(cardType === 'warning_events' ? ps.colors.warning : ps.colors.info)} /> {card.displayName}</div>
            <div style={ps.col}>
              {[
                { type: 'Warning', count: 12, msg: 'BackOff restarting failed container' },
                { type: 'Warning', count: 5, msg: 'Readiness probe failed' },
                { type: 'Normal', count: 34, msg: 'Scheduled successfully' },
              ].map((e, i) => (
                <div key={i} style={{ ...ps.row, fontSize: PREV_FS_CAPTION }}>
                  <span style={{ color: e.type === 'Warning' ? ps.colors.warning : ps.colors.healthy, fontWeight: 600, minWidth: '18px' }}>{e.count}</span>
                  <span style={{ color: PREV_CLR_SECONDARY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.msg}</span>
                </div>
              ))}
            </div>
          </div>
        )

      case 'operator_status':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> Operator Status</div>
            <div style={ps.col}>
              {[
                { name: 'cert-manager', ready: true },
                { name: 'gpu-operator', ready: true },
                { name: 'prometheus-operator', ready: true },
                { name: 'node-feature-discovery', ready: false },
              ].map((o) => (
                <div key={o.name} style={{ ...ps.row, fontSize: PREV_FS_CAPTION }}>
                  <span style={ps.dot(o.ready ? ps.colors.healthy : ps.colors.warning)} />
                  <span>{o.name}</span>
                </div>
              ))}
            </div>
          </div>
        )

      case 'storage_overview':
      case 'pvc_status':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> {card.displayName}</div>
            <div style={ps.row}>
              <div style={ps.statBlock}>
                <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: ps.colors.info }}>24</span>
                <span style={ps.statLbl}>{t('common.pvcs')}</span>
              </div>
              <div style={ps.statBlock}>
                <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: ps.colors.healthy }}>22</span>
                <span style={ps.statLbl}>{t('common.bound')}</span>
              </div>
              <div style={ps.statBlock}>
                <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: ps.colors.warning }}>2</span>
                <span style={ps.statLbl}>{t('common.pending')}</span>
              </div>
            </div>
          </div>
        )

      case 'network_overview':
      case 'service_status':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> {card.displayName}</div>
            <div style={{ ...ps.row, marginBottom: PREV_SM }}>
              <div style={ps.statBlock}>
                <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT }}>18</span>
                <span style={ps.statLbl}>{t('common.services')}</span>
              </div>
              <div style={ps.statBlock}>
                <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: ps.colors.info }}>6</span>
                <span style={ps.statLbl}>Policies</span>
              </div>
            </div>
            <div style={ps.col}>
              {['ClusterIP (12)', 'LoadBalancer (4)', 'NodePort (2)'].map((s) => (
                <div key={s} style={{ fontSize: PREV_FS_CAPTION, color: PREV_CLR_MUTED }}>{s}</div>
              ))}
            </div>
          </div>
        )

      case 'opencost_overview':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> OpenCost Overview</div>
            <div style={{ textAlign: 'center', marginBottom: PREV_SM }}>
              <div style={{ fontSize: PREV_FS_HEADLINE, fontWeight: 700, color: ps.colors.healthy }}>$1,247</div>
              <div style={ps.muted}>Monthly estimate</div>
            </div>
            <div style={ps.row}>
              <div style={ps.statBlock}>
                <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT_SM, color: PREV_CLR_CPU }}>$482</span>
                <span style={ps.statLbl}>Compute</span>
              </div>
              <div style={ps.statBlock}>
                <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT_SM, color: PREV_CLR_MEM }}>$635</span>
                <span style={ps.statLbl}>GPU</span>
              </div>
              <div style={ps.statBlock}>
                <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT_SM, color: ps.colors.info }}>$130</span>
                <span style={ps.statLbl}>{t('common.storage')}</span>
              </div>
            </div>
          </div>
        )

      case 'provider_health':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> Provider Health</div>
            <div style={ps.col}>
              {[
                { name: 'OpenAI', status: 'operational', color: ps.colors.healthy },
                { name: 'Anthropic', status: 'operational', color: ps.colors.healthy },
                { name: 'AWS', status: 'degraded', color: ps.colors.warning },
                { name: 'GCP', status: 'operational', color: ps.colors.healthy },
              ].map((p) => (
                <div key={p.name} style={{ ...ps.row, justifyContent: 'space-between', fontSize: PREV_FS_CAPTION }}>
                  <span style={WIDGET_EXPORT_MODAL_SPAN_STYLE_2}>{p.name}</span>
                  <span style={{ color: p.color }}>{p.status}</span>
                </div>
              ))}
            </div>
          </div>
        )

      case 'nightly_release_pulse':
        return (
          <div style={ps.card}>
            <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> Nightly Release Pulse</div>
            <div style={{ textAlign: 'center', marginBottom: PREV_SM }}>
              <div style={{ fontSize: PREV_FS_FEATURED, fontWeight: 700, color: ps.colors.healthy }}>v0.3.22</div>
              <div style={ps.muted}>Released 2h ago</div>
            </div>
            <div style={ps.row}>
              <div style={ps.statBlock}>
                <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT_SM, color: ps.colors.healthy }}>12</span>
                <span style={ps.statLbl}>Streak</span>
              </div>
              <div style={ps.statBlock}>
                <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT_SM, color: ps.colors.info }}>93%</span>
                <span style={ps.statLbl}>Pass rate</span>
              </div>
            </div>
          </div>
        )

    default:
      return null
  }
}
