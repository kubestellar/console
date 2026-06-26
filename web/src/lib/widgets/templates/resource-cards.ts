import type { TemplateParts, WidgetCardLike } from './types'

export function getResourceCardRender(
  cardType: string,
  card: WidgetCardLike,
  { parseBlock, wrapOpen, wrapClose, issueButton }: TemplateParts,
): string | undefined {
  switch (cardType) {
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
      return undefined
  }
}
