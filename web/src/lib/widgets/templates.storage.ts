import { parseBlock, wrapOpen, wrapClose, issueButton } from './templates.shared'
import { WIDGET_CARDS } from './widgetRegistry'

export function generateStorageCardRender(cardType: string, card: any, title: string): string {
  card = card || WIDGET_CARDS[cardType]
  title = title || card?.displayName || cardType

  switch (cardType) {
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
    default:
      return ''
  }
}
