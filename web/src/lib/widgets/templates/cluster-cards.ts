import type { TemplateParts, WidgetCardLike } from './types'

export function getClusterCardRender(
  cardType: string,
  card: WidgetCardLike,
  { parseBlock, wrapOpen, wrapClose, issueButton }: TemplateParts,
): string | undefined {
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
    default:
      return undefined
  }
}
