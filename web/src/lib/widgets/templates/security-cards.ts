import type { TemplateParts, WidgetCardLike } from './types'

export function getSecurityCardRender(
  cardType: string,
  _card: WidgetCardLike,
  { parseBlock, wrapOpen, wrapClose, issueButton }: TemplateParts,
): string | undefined {
  switch (cardType) {
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

    case 'active_alerts':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Active Alerts</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const alerts = data?.events || data?.alerts || [];
${wrapOpen}
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
        </div>${wrapClose}
};`
    default:
      return undefined
  }
}
