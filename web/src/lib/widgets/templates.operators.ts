import { parseBlock, wrapOpen, wrapClose, issueButton } from './templates.shared'
import { WIDGET_CARDS } from './widgetRegistry'

export function generateOperatorsCardRender(cardType: string, card: any, title: string): string {
  card = card || WIDGET_CARDS[cardType]
  title = title || card?.displayName || cardType

  switch (cardType) {
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
    case 'helm_releases':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Helm Releases</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const releases = data?.releases || [];
  const deployed = releases.filter(r => r.status === 'deployed').length;
${wrapOpen}
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
        <div style={{fontSize: '11px', color: '#9ca3af', marginTop: '4px'}}>{deployed}/{releases.length} deployed</div>${wrapClose}
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
    default:
      return ''
  }
}
