/**
 * Render templates for infrastructure-oriented widget cards
 */

import { WIDGET_CARDS } from '../widgetRegistry'
import { ISSUE_BUTTON, PARSE_BLOCK, WRAP_CLOSE, WRAP_OPEN } from './shared'

export function generateInfrastructureCardRenderFunction(cardType: string): string | null {
  const card = WIDGET_CARDS[cardType]

  switch (cardType) {
    case 'gpu_overview':
      return `
export const render = ({ output }) => {${PARSE_BLOCK}

  if (error) {${WRAP_OPEN}
        <div style={styles.cardTitle}>
          <span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />
          ${card.displayName}
        </div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${ISSUE_BUTTON}${WRAP_CLOSE}
  }

  const rawNodes = data?.nodes || data || [];
  const nodes = Array.isArray(rawNodes) ? rawNodes : [];
  const totalGPUs = nodes.reduce((sum, n) => sum + (n.gpuCount || 0), 0);
  const allocatedGPUs = nodes.reduce((sum, n) => sum + (n.gpuAllocated || 0), 0);
  const utilization = totalGPUs > 0 ? Math.round((allocatedGPUs / totalGPUs) * 100) : 0;
${WRAP_OPEN}
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
        </div>${WRAP_CLOSE}
};`

    case 'storage_overview':
      return `
export const render = ({ output }) => {${PARSE_BLOCK}

  if (error) {${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Storage Overview</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${ISSUE_BUTTON}${WRAP_CLOSE}
  }

  const pvcs = data?.pvcs || [];
  const bound = pvcs.filter(p => p.status === 'Bound').length;
  const pending = pvcs.length - bound;
${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: pending > 0 ? styles.colors.warning : styles.colors.healthy}} />Storage Overview</div>
        <div style={styles.row}>
          <div style={{...styles.statBlock, borderLeft: \`3px solid \${styles.colors.healthy}\`}}>
            <span style={{...styles.statValue, color: styles.colors.healthy}}>{bound}</span>
            <span style={styles.statLabel}>Bound</span>
          </div>
          <div style={{...styles.statBlock, borderLeft: \`3px solid \${styles.colors.warning}\`}}>
            <span style={{...styles.statValue, color: pending > 0 ? styles.colors.warning : styles.colors.info}}>{pending}</span>
            <span style={styles.statLabel}>Pending</span>
          </div>
        </div>
        <div style={{fontSize: '11px', color: '#9ca3af', marginTop: '4px'}}>{pvcs.length} PVCs</div>${WRAP_CLOSE}
};`

    case 'pvc_status':
      return `
export const render = ({ output }) => {${PARSE_BLOCK}

  if (error) {${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />PVC Status</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${ISSUE_BUTTON}${WRAP_CLOSE}
  }

  const pvcs = (data?.pvcs || []).slice(0, 6);
${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.info}} />PVC Status</div>
        <div style={styles.column}>
          {pvcs.map((p, i) => (
            <div key={i} style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
              <span style={{color: '#e2e8f0', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{p.name}</span>
              <span style={{color: p.status === 'Bound' ? styles.colors.healthy : styles.colors.warning, fontSize: '10px'}}>{p.status} {p.capacity}</span>
            </div>
          ))}
          {pvcs.length === 0 && <div style={{color: '#9ca3af', fontSize: '12px'}}>No PVCs found</div>}
        </div>${WRAP_CLOSE}
};`

    case 'network_overview':
      return `
export const render = ({ output }) => {${PARSE_BLOCK}

  if (error) {${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Network Overview</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${ISSUE_BUTTON}${WRAP_CLOSE}
  }

  const policies = data?.networkpolicies || [];
${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.info}} />Network Overview</div>
        <div style={{textAlign: 'center', marginBottom: '8px'}}>
          <div style={{fontSize: '28px', fontWeight: 700}}>{policies.length}</div>
          <div style={{fontSize: '12px', color: '#9ca3af'}}>Network Policies</div>
        </div>
        <div style={styles.column}>
          {policies.slice(0, 4).map((p, i) => (
            <div key={i} style={{fontSize: '11px', padding: '2px 0', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
              {p.name} <span style={{color: '#64748b'}}>({p.cluster})</span>
            </div>
          ))}
        </div>${WRAP_CLOSE}
};`

    case 'service_status':
      return `
export const render = ({ output }) => {${PARSE_BLOCK}

  if (error) {${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Service Status</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${ISSUE_BUTTON}${WRAP_CLOSE}
  }

  const services = data?.services || [];
  const clusterCounts = data?.clusterCounts || [];
${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.info}} />Service Status</div>
        <div style={{textAlign: 'center', marginBottom: '8px'}}>
          <div style={{fontSize: '28px', fontWeight: 700}}>{services.length}</div>
          <div style={{fontSize: '12px', color: '#9ca3af'}}>Services</div>
        </div>
        <div style={styles.column}>
          {clusterCounts.slice(0, 4).map((cc, i) => (
            <div key={i} style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '2px 0'}}>
              <span style={{color: '#94a3b8'}}>{cc.cluster}</span>
              <span style={{color: '#e2e8f0', fontWeight: 600}}>{cc.services}</span>
            </div>
          ))}
        </div>${WRAP_CLOSE}
};`

    case 'operator_status':
      return `
export const render = ({ output }) => {${PARSE_BLOCK}

  if (error) {${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Operator Status</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${ISSUE_BUTTON}${WRAP_CLOSE}
  }

  const operators = data?.operators || [];
${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.info}} />Operator Status</div>
        <div style={styles.column}>
          {operators.slice(0, 6).map((op, i) => (
            <div key={i} style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
              <span style={{color: '#e2e8f0', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{op.displayName || op.name}</span>
              <span style={{color: '#9ca3af', fontSize: '10px'}}>{op.version}</span>
            </div>
          ))}
          {operators.length === 0 && <div style={{color: '#9ca3af', fontSize: '12px'}}>No operators found</div>}
        </div>
        <div style={{fontSize: '11px', color: '#9ca3af', marginTop: '4px'}}>{operators.length} operators</div>${WRAP_CLOSE}
};`

    case 'helm_releases':
      return `
export const render = ({ output }) => {${PARSE_BLOCK}

  if (error) {${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Helm Releases</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${ISSUE_BUTTON}${WRAP_CLOSE}
  }

  const releases = data?.releases || [];
  const deployed = releases.filter(r => r.status === 'deployed').length;
${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.info}} />Helm Releases</div>
        <div style={styles.column}>
          {releases.slice(0, 6).map((r, i) => (
            <div key={i} style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
              <span style={{color: '#e2e8f0', maxWidth: '50%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{r.name}</span>
              <span style={{color: r.status === 'deployed' ? styles.colors.healthy : styles.colors.warning, fontSize: '10px'}}>{r.status} {r.app_version || ''}</span>
            </div>
          ))}
          {releases.length === 0 && <div style={{color: '#9ca3af', fontSize: '12px'}}>No releases found</div>}
        </div>
        <div style={{fontSize: '11px', color: '#9ca3af', marginTop: '4px'}}>{deployed}/{releases.length} deployed</div>${WRAP_CLOSE}
};`

    case 'provider_health':
      return `
export const render = ({ output }) => {${PARSE_BLOCK}

  if (error) {${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Provider Health</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${ISSUE_BUTTON}${WRAP_CLOSE}
  }

  const providers = data?.providers || [];
${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.info}} />Provider Health</div>
        <div style={styles.column}>
          {providers.map((p, i) => (
            <div key={i} style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0'}}>
              <span style={{color: '#e2e8f0'}}>{p.name}</span>
              <span style={{color: p.healthy ? styles.colors.healthy : styles.colors.error}}>{p.healthy ? 'Healthy' : 'Unhealthy'}</span>
            </div>
          ))}
          {providers.length === 0 && <div style={{color: '#9ca3af', fontSize: '12px'}}>No provider data</div>}
        </div>${WRAP_CLOSE}
};`

    case 'opencost_overview':
      return `
export const render = ({ output }) => {${PARSE_BLOCK}

  if (error) {${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />OpenCost Overview</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${ISSUE_BUTTON}${WRAP_CLOSE}
  }

  const costs = data?.costs || data || {};
${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.info}} />OpenCost Overview</div>
        <div style={{fontSize: '12px', color: '#9ca3af'}}>Cost data from cluster</div>
        <pre style={{fontSize: '10px', color: '#94a3b8', overflow: 'auto', maxHeight: '80px', margin: '8px 0 0 0'}}>
          {JSON.stringify(costs, null, 2)}
        </pre>${WRAP_CLOSE}
};`

    case 'event_summary':
      return `
export const render = ({ output }) => {${PARSE_BLOCK}

  if (error) {${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Event Summary</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${ISSUE_BUTTON}${WRAP_CLOSE}
  }

  const events = data?.events || [];
  const warnings = events.filter(e => e.type === 'Warning').length;
  const normal = events.filter(e => e.type === 'Normal').length;
${WRAP_OPEN}
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
        <div style={{fontSize: '11px', color: '#9ca3af', marginTop: '4px'}}>{events.length} total events</div>${WRAP_CLOSE}
};`

    case 'warning_events':
      return `
export const render = ({ output }) => {${PARSE_BLOCK}

  if (error) {${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Warning Events</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${ISSUE_BUTTON}${WRAP_CLOSE}
  }

  const events = (data?.events || []).slice(0, 6);
${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: events.length > 0 ? styles.colors.warning : styles.colors.healthy}} />Warning Events</div>
        <div style={styles.column}>
          {events.map((ev, i) => (
            <div key={i} style={{fontSize: '11px', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
              <div style={{color: styles.colors.warning, fontWeight: 600}}>{ev.reason}</div>
              <div style={{color: '#9ca3af', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '230px'}}>{ev.message}</div>
            </div>
          ))}
          {events.length === 0 && <div style={{color: styles.colors.healthy, fontSize: '14px'}}>No warnings</div>}
        </div>${WRAP_CLOSE}
};`

    case 'active_alerts':
      return `
export const render = ({ output }) => {${PARSE_BLOCK}

  if (error) {${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Active Alerts</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${ISSUE_BUTTON}${WRAP_CLOSE}
  }

  const alerts = data?.events || data?.alerts || [];
${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: alerts.length > 0 ? styles.colors.warning : styles.colors.healthy}} />Active Alerts</div>
        <div style={{textAlign: 'center', marginBottom: '8px'}}>
          <div style={{fontSize: '28px', fontWeight: 700, color: alerts.length > 0 ? styles.colors.warning : styles.colors.healthy}}>{alerts.length}</div>
          <div style={{fontSize: '12px', color: '#9ca3af'}}>Warning Events</div>
        </div>
        <div style={styles.column}>
          {alerts.slice(0, 4).map((a, i) => (
            <div key={i} style={{fontSize: '11px', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
              <div style={{color: styles.colors.warning, fontWeight: 600}}>{a.reason}</div>
              <div style={{color: '#9ca3af', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px'}}>{a.message}</div>
            </div>
          ))}
          {alerts.length === 0 && <div style={{color: styles.colors.healthy}}>No active alerts</div>}
        </div>${WRAP_CLOSE}
};`

    case 'security_issues':
      return `
export const render = ({ output }) => {${PARSE_BLOCK}

  if (error) {${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Security Issues</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${ISSUE_BUTTON}${WRAP_CLOSE}
  }

  const issues = data?.issues || [];
  const high = issues.filter(i => i.severity === 'high' || i.severity === 'critical').length;
  const medium = issues.filter(i => i.severity === 'medium').length;
  const low = issues.filter(i => i.severity === 'low').length;
${WRAP_OPEN}
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
        </div>${WRAP_CLOSE}
};`

    default:
      return null
  }
}
