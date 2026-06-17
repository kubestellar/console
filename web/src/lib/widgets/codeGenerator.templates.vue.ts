import type { CardRenderShared } from './codeGenerator.templates.utility'

export function generateVueCardRenderCase(
  cardType: string,
  _card: { displayName?: string },
  shared: CardRenderShared,
): string | null {
  const { parseBlock, wrapOpen, wrapClose, issueButton } = shared

  switch (cardType) {
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


    case 'opencost_overview':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />OpenCost Overview</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const costs = data?.costs || data || {};
${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.info}} />OpenCost Overview</div>
        <div style={{fontSize: '12px', color: '#9ca3af'}}>Cost data from cluster</div>
        <pre style={{fontSize: '10px', color: '#94a3b8', overflow: 'auto', maxHeight: '80px', margin: '8px 0 0 0'}}>
          {JSON.stringify(costs, null, 2)}
        </pre>${wrapClose}
};`


    default:
      return null
  }
}
