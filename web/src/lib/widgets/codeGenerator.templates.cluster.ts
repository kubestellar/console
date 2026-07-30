/**
 * Card render template helpers for cluster widgets.
 */

import type { TemplateHelpers } from './codeGenerator.templates'
import { WIDGET_CARDS } from './widgetRegistry'

export function generateClusterCardRender(cardType: string, helpers: TemplateHelpers): string | null {
  const card = WIDGET_CARDS[cardType]
  const { parseBlock, wrapOpen, wrapClose, issueButton } = helpers

  switch (cardType) {
    case 'cluster_health':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}>
          <span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />
          ${card.displayName}
        </div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const clusters = data?.clusters || [];
  const healthy = clusters.filter(c => c.healthy !== false).length;
  const unhealthy = clusters.length - healthy;
${wrapOpen}
        <div style={styles.cardTitle}>
          <span style={{...styles.statusDot, backgroundColor: unhealthy > 0 ? styles.colors.warning : styles.colors.healthy}} />
          ${card.displayName}
        </div>
        <div style={styles.row}>
          <div style={{...styles.statBlock, borderLeft: \`3px solid \${styles.colors.healthy}\`}}>
            <span style={{...styles.statValue, color: styles.colors.healthy}}>{healthy}</span>
            <span style={styles.statLabel}>Healthy</span>
          </div>
          <div style={{...styles.statBlock, borderLeft: \`3px solid \${styles.colors.error}\`}}>
            <span style={{...styles.statValue, color: unhealthy > 0 ? styles.colors.error : styles.colors.info}}>{unhealthy}</span>
            <span style={styles.statLabel}>Unhealthy</span>
          </div>
        </div>${wrapClose}
};`

    case 'pod_issues':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}>
          <span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />
          ${card.displayName}
        </div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const rawIssues = data?.issues || data || [];
  const issues = Array.isArray(rawIssues) ? rawIssues : [];
  const crashLoop = issues.filter(i => i.reason === 'CrashLoopBackOff').length;
  const oomKilled = issues.filter(i => i.reason === 'OOMKilled').length;
  const other = issues.length - crashLoop - oomKilled;
${wrapOpen}
        <div style={styles.cardTitle}>
          <span style={{...styles.statusDot, backgroundColor: issues.length > 0 ? styles.colors.warning : styles.colors.healthy}} />
          ${card.displayName}
        </div>
        <div style={{fontSize: '12px', color: '#9ca3af', marginBottom: '8px'}}>
          {issues.length} total issues
        </div>
        <div style={styles.column}>
          {crashLoop > 0 && (
            <div style={{...styles.row, padding: '4px 8px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px'}}>
              <span style={{color: styles.colors.error, fontWeight: 600}}>{crashLoop}</span>
              <span style={{color: '#9ca3af', fontSize: '12px'}}>CrashLoopBackOff</span>
            </div>
          )}
          {oomKilled > 0 && (
            <div style={{...styles.row, padding: '4px 8px', backgroundColor: 'rgba(234, 179, 8, 0.1)', borderRadius: '4px'}}>
              <span style={{color: styles.colors.warning, fontWeight: 600}}>{oomKilled}</span>
              <span style={{color: '#9ca3af', fontSize: '12px'}}>OOMKilled</span>
            </div>
          )}
          {other > 0 && (
            <div style={{...styles.row, padding: '4px 8px', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '4px'}}>
              <span style={{color: styles.colors.info, fontWeight: 600}}>{other}</span>
              <span style={{color: '#9ca3af', fontSize: '12px'}}>Other</span>
            </div>
          )}
          {issues.length === 0 && (
            <div style={{color: styles.colors.healthy, fontSize: '14px'}}>No issues detected</div>
          )}
        </div>${wrapClose}
};`

    case 'gpu_overview':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}>
          <span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />
          ${card.displayName}
        </div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const rawNodes = data?.nodes || data || [];
  const nodes = Array.isArray(rawNodes) ? rawNodes : [];
  const totalGPUs = nodes.reduce((sum, n) => sum + (n.gpuCount || 0), 0);
  const allocatedGPUs = nodes.reduce((sum, n) => sum + (n.gpuAllocated || 0), 0);
  const utilization = totalGPUs > 0 ? Math.round((allocatedGPUs / totalGPUs) * 100) : 0;
${wrapOpen}
        <div style={styles.cardTitle}>
          <span style={{...styles.statusDot, backgroundColor: styles.colors.purple}} />
          ${card.displayName}
        </div>
        <div style={{textAlign: 'center', marginBottom: '12px'}}>
          <div style={{fontSize: '32px', fontWeight: 700, color: styles.colors.purple}}>{utilization}%</div>
          <div style={{fontSize: '12px', color: '#9ca3af'}}>Utilization</div>
        </div>
        <div style={styles.row}>
          <div style={styles.statBlock}>
            <span style={styles.statValue}>{totalGPUs}</span>
            <span style={styles.statLabel}>Total</span>
          </div>
          <div style={styles.statBlock}>
            <span style={{...styles.statValue, color: styles.colors.purple}}>{allocatedGPUs}</span>
            <span style={styles.statLabel}>Allocated</span>
          </div>
        </div>${wrapClose}
};`

    case 'cluster_metrics':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Cluster Metrics</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const clusters = data?.clusters || [];
  const totalNodes = clusters.reduce((s, c) => s + (c.nodeCount || 0), 0);
  const totalPods = clusters.reduce((s, c) => s + (c.podCount || 0), 0);
${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.info}} />Cluster Metrics</div>
        <div style={styles.row}>
          <div style={styles.statBlock}>
            <span style={styles.statValue}>{clusters.length}</span>
            <span style={styles.statLabel}>Clusters</span>
          </div>
          <div style={styles.statBlock}>
            <span style={styles.statValue}>{totalNodes}</span>
            <span style={styles.statLabel}>Nodes</span>
          </div>
          <div style={styles.statBlock}>
            <span style={styles.statValue}>{totalPods}</span>
            <span style={styles.statLabel}>Pods</span>
          </div>
        </div>${wrapClose}
};`

    case 'workload_status':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Workload Status</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const workloads = data?.workloads || [];
  const running = workloads.filter(w => w.status === 'Running' || w.readyReplicas > 0).length;
  const degraded = workloads.length - running;
${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: degraded > 0 ? styles.colors.warning : styles.colors.healthy}} />Workload Status</div>
        <div style={styles.row}>
          <div style={{...styles.statBlock, borderLeft: \`3px solid \${styles.colors.healthy}\`}}>
            <span style={{...styles.statValue, color: styles.colors.healthy}}>{running}</span>
            <span style={styles.statLabel}>Running</span>
          </div>
          <div style={{...styles.statBlock, borderLeft: \`3px solid \${styles.colors.error}\`}}>
            <span style={{...styles.statValue, color: degraded > 0 ? styles.colors.error : styles.colors.info}}>{degraded}</span>
            <span style={styles.statLabel}>Degraded</span>
          </div>
        </div>
        <div style={{fontSize: '11px', color: '#9ca3af', marginTop: '4px'}}>{workloads.length} total workloads</div>${wrapClose}
};`

    case 'security_issues':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Security Issues</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const issues = data?.issues || [];
  const high = issues.filter(i => i.severity === 'high' || i.severity === 'critical').length;
  const medium = issues.filter(i => i.severity === 'medium').length;
  const low = issues.filter(i => i.severity === 'low').length;
${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: high > 0 ? styles.colors.error : styles.colors.healthy}} />Security Issues</div>
        <div style={{fontSize: '12px', color: '#9ca3af', marginBottom: '8px'}}>{issues.length} total</div>
        <div style={styles.column}>
          {high > 0 && <div style={{...styles.row, padding: '4px 8px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px'}}>
            <span style={{color: styles.colors.error, fontWeight: 600}}>{high}</span>
            <span style={{color: '#9ca3af', fontSize: '12px'}}>High/Critical</span>
          </div>}
          {medium > 0 && <div style={{...styles.row, padding: '4px 8px', backgroundColor: 'rgba(234, 179, 8, 0.1)', borderRadius: '4px'}}>
            <span style={{color: styles.colors.warning, fontWeight: 600}}>{medium}</span>
            <span style={{color: '#9ca3af', fontSize: '12px'}}>Medium</span>
          </div>}
          {low > 0 && <div style={{...styles.row, padding: '4px 8px', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '4px'}}>
            <span style={{color: styles.colors.info, fontWeight: 600}}>{low}</span>
            <span style={{color: '#9ca3af', fontSize: '12px'}}>Low</span>
          </div>}
          {issues.length === 0 && <div style={{color: styles.colors.healthy, fontSize: '14px'}}>No issues found</div>}
        </div>${wrapClose}
};`

    case 'app_status':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Application Status</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const workloads = data?.workloads || [];
  const running = workloads.filter(w => w.status === 'Running').length;
  const total = workloads.length;
${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: running === total && total > 0 ? styles.colors.healthy : styles.colors.warning}} />Application Status</div>
        <div style={styles.row}>
          <div style={styles.statBlock}>
            <span style={{...styles.statValue, color: styles.colors.healthy}}>{running}</span>
            <span style={styles.statLabel}>Running</span>
          </div>
          <div style={styles.statBlock}>
            <span style={styles.statValue}>{total}</span>
            <span style={styles.statLabel}>Total</span>
          </div>
        </div>${wrapClose}
};`

    case 'top_pods':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Top Pods</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const pods = (data?.pods || []).slice(0, 8);
${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.info}} />Top Pods</div>
        <div style={styles.column}>
          {pods.map((p, i) => (
            <div key={i} style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
              <span style={{color: '#e2e8f0', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{p.name}</span>
              <span style={{color: p.status === 'Running' ? styles.colors.healthy : styles.colors.warning, fontSize: '10px'}}>{p.status}</span>
            </div>
          ))}
          {pods.length === 0 && <div style={{color: '#9ca3af', fontSize: '12px'}}>No pods found</div>}
        </div>${wrapClose}
};`

    case 'console_ai_offline_detection':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />AI Node Offline Detection</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const nodes = data?.nodes || [];
  const offline = nodes.filter(n => n.status !== 'Ready').length;
  const online = nodes.length - offline;
${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: offline > 0 ? styles.colors.error : styles.colors.healthy}} />AI Node Offline Detection</div>
        <div style={styles.row}>
          <div style={{...styles.statBlock, borderLeft: \`3px solid \${styles.colors.healthy}\`}}>
            <span style={{...styles.statValue, color: styles.colors.healthy}}>{online}</span>
            <span style={styles.statLabel}>Online</span>
          </div>
          <div style={{...styles.statBlock, borderLeft: \`3px solid \${styles.colors.error}\`}}>
            <span style={{...styles.statValue, color: offline > 0 ? styles.colors.error : styles.colors.info}}>{offline}</span>
            <span style={styles.statLabel}>Offline</span>
          </div>
        </div>${wrapClose}
};`

    case 'console_ai_health_check':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />AI Health Check</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const clusters = data?.clusters || [];
  const healthy = clusters.filter(c => c.healthy !== false).length;
${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: healthy === clusters.length && clusters.length > 0 ? styles.colors.healthy : styles.colors.warning}} />AI Health Check</div>
        <div style={styles.row}>
          <div style={styles.statBlock}>
            <span style={{...styles.statValue, color: styles.colors.healthy}}>{healthy}</span>
            <span style={styles.statLabel}>Healthy</span>
          </div>
          <div style={styles.statBlock}>
            <span style={styles.statValue}>{clusters.length}</span>
            <span style={styles.statLabel}>Total</span>
          </div>
        </div>${wrapClose}
};`

    case 'namespace_overview':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Namespace Overview</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const namespaces = data?.namespaces || [];
${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.info}} />Namespace Overview</div>
        <div style={{textAlign: 'center', marginBottom: '8px'}}>
          <div style={{fontSize: '28px', fontWeight: 700}}>{namespaces.length}</div>
          <div style={{fontSize: '12px', color: '#9ca3af'}}>Namespaces</div>
        </div>${wrapClose}
};`

    case 'event_summary':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Event Summary</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const events = data?.events || [];
  const warnings = events.filter(e => e.type === 'Warning').length;
  const normal = events.filter(e => e.type === 'Normal').length;
${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: warnings > 0 ? styles.colors.warning : styles.colors.healthy}} />Event Summary</div>
        <div style={styles.row}>
          <div style={{...styles.statBlock, borderLeft: \`3px solid \${styles.colors.healthy}\`}}>
            <span style={{...styles.statValue, color: styles.colors.healthy}}>{normal}</span>
            <span style={styles.statLabel}>Normal</span>
          </div>
          <div style={{...styles.statBlock, borderLeft: \`3px solid \${styles.colors.warning}\`}}>
            <span style={{...styles.statValue, color: warnings > 0 ? styles.colors.warning : styles.colors.info}}>{warnings}</span>
            <span style={styles.statLabel}>Warning</span>
          </div>
        </div>
        <div style={{fontSize: '11px', color: '#9ca3af', marginTop: '4px'}}>{events.length} total events</div>${wrapClose}
};`

    case 'warning_events':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Warning Events</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const events = (data?.events || []).slice(0, 6);
${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: events.length > 0 ? styles.colors.warning : styles.colors.healthy}} />Warning Events</div>
        <div style={styles.column}>
          {events.map((ev, i) => (
            <div key={i} style={{fontSize: '11px', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
              <div style={{color: styles.colors.warning, fontWeight: 600}}>{ev.reason}</div>
              <div style={{color: '#9ca3af', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '230px'}}>{ev.message}</div>
            </div>
          ))}
          {events.length === 0 && <div style={{color: styles.colors.healthy, fontSize: '14px'}}>No warnings</div>}
        </div>${wrapClose}
};`

    default:
      return null
  }
}
