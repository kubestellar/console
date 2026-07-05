import { parseBlock, wrapOpen, wrapClose, issueButton } from './templates.shared'
import { WIDGET_CARDS, type WidgetCardDefinition } from './widgetRegistry'

export function generateConsoleAICardRender(cardType: string, _card?: WidgetCardDefinition | null, _title?: string): string {
  const card = _card || WIDGET_CARDS[cardType]
  void card

  switch (cardType) {
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
    default:
      return ''
  }
}
