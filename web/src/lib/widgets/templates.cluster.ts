import { parseBlock, wrapOpen, wrapClose, issueButton } from './templates.shared'
import { WIDGET_CARDS } from './widgetRegistry'

export function generateClusterCardRender(cardType: string, card: any, title: string): string {
  card = card || WIDGET_CARDS[cardType]
  title = title || card?.displayName || cardType

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
    default:
      return ''
  }
}
