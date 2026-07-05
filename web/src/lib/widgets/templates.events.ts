import { parseBlock, wrapOpen, wrapClose, issueButton } from './templates.shared'
import { WIDGET_CARDS, type WidgetCardDefinition } from './widgetRegistry'

export function generateEventsCardRender(cardType: string, card: WidgetCardDefinition | null, _title?: string): string {
  card = card || WIDGET_CARDS[cardType]

  switch (cardType) {
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
      return ''
  }
}
