import { parseBlock, wrapOpen, wrapClose, issueButton } from './templates.shared'
import { WIDGET_CARDS, type WidgetCardDefinition } from './widgetRegistry'

export function generatePodsCardRender(cardType: string, card: WidgetCardDefinition | null, _title?: string): string {
  card = card || WIDGET_CARDS[cardType]

  switch (cardType) {
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
    default:
      return ''
  }
}
