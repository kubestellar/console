/**
 * Shared helpers for Übersicht widget template generation.
 */

export interface CardRenderContext {
  title: string
  card: { displayName: string }
  parseBlock: string
  wrapOpen: string
  wrapClose: string
  issueButton: string
}

export function buildCardRenderContext(title: string, card: { displayName: string }): CardRenderContext {
  const parseBlock = `
  let data = null;
  let error = null;
  try {
    const trimmed = (output || '').trim();
    if (!trimmed) {
      error = 'No response';
    } else if (trimmed.startsWith('<!') || trimmed.startsWith('<html')) {
      error = 'Endpoint not available';
    } else if (trimmed.includes('"error"')) {
      try {
        const parsed = JSON.parse(trimmed);
        error = parsed.error || 'Load failed';
      } catch {
        error = 'Load failed';
      }
    } else {
      data = JSON.parse(trimmed);
    }
  } catch (e) {
    error = 'Parse error';
  }

  const containerStyle = {
    ...styles.card,
    position: 'absolute',
    top: widgetPosition.top + 'px',
    left: widgetPosition.left + 'px',
    pointerEvents: 'auto',
  };`

  const wrapOpen = `
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div className="widget-container" style={containerStyle}>
        <div className="drag-handle" style={styles.dragHandle} onMouseDown={handleDragStart} title="Drag to move">
          <span style={styles.dragIndicator}>⋮⋮</span>
        </div>`

  const wrapClose = `
      </div>
    </div>
  );`

  const issueButton = `
        <div style={{marginTop: '8px'}}><button style={styles.issueBtn} onClick={() => openIssue(error)}>Report Issue</button></div>`

  return {
    title,
    card,
    parseBlock,
    wrapOpen,
    wrapClose,
    issueButton,
  }
}

export function generateDefaultCardRender(context: CardRenderContext): string {
  const { title, parseBlock, wrapOpen, wrapClose, issueButton } = context
  const safeTitleExpr = `{${JSON.stringify(title)}}`
  return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}>${safeTitleExpr}</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }
${wrapOpen}
        <div style={styles.cardTitle}>${safeTitleExpr}</div>
        <pre style={{fontSize: '10px', overflow: 'auto', maxHeight: '100px'}}>
          {JSON.stringify(data, null, 2)}
        </pre>${wrapClose}
};`
}
