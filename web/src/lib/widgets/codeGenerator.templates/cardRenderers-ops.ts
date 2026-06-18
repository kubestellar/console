/**
 * Focused card renderers extracted from codeGenerator.templates.ts.
 */

import type { CardRenderContext } from './shared'

export function generateOperationsCardRender(cardType: string, context: CardRenderContext): string | undefined {
  const { card, parseBlock, wrapOpen, wrapClose, issueButton } = context

  switch (cardType) {
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

    case 'storage_overview':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Storage Overview</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const pvcs = data?.pvcs || [];
  const bound = pvcs.filter(p => p.status === 'Bound').length;
  const pending = pvcs.length - bound;
${wrapOpen}
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
        <div style={{fontSize: '11px', color: '#9ca3af', marginTop: '4px'}}>{pvcs.length} PVCs</div>${wrapClose}
};`

    case 'pvc_status':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />PVC Status</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const pvcs = (data?.pvcs || []).slice(0, 6);
${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.info}} />PVC Status</div>
        <div style={styles.column}>
          {pvcs.map((p, i) => (
            <div key={i} style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
              <span style={{color: '#e2e8f0', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{p.name}</span>
              <span style={{color: p.status === 'Bound' ? styles.colors.healthy : styles.colors.warning, fontSize: '10px'}}>{p.status} {p.capacity}</span>
            </div>
          ))}
          {pvcs.length === 0 && <div style={{color: '#9ca3af', fontSize: '12px'}}>No PVCs found</div>}
        </div>${wrapClose}
};`

    case 'network_overview':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Network Overview</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const policies = data?.networkpolicies || [];
${wrapOpen}
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
        </div>${wrapClose}
};`

    case 'service_status':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Service Status</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const services = data?.services || [];
  const clusterCounts = data?.clusterCounts || [];
${wrapOpen}
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
        </div>${wrapClose}
};`

    case 'operator_status':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Operator Status</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const operators = data?.operators || [];
${wrapOpen}
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
        <div style={{fontSize: '11px', color: '#9ca3af', marginTop: '4px'}}>{operators.length} operators</div>${wrapClose}
};`


    default:
      return undefined
  }
}
