import type { TemplateParts, WidgetCardLike } from './types'

export function getDeploymentCardRender(
  cardType: string,
  card: WidgetCardLike,
  { parseBlock, wrapOpen, wrapClose, issueButton }: TemplateParts,
): string | undefined {
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
    default:
      return undefined
  }
}
