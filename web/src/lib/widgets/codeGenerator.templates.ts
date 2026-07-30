/**
 * Template generators for widget code generation.
 */

import { WIDGET_CARDS } from './widgetRegistry'
import { generateClusterCardRender } from './codeGenerator.templates.cluster'
import { generateInfraCardRender } from './codeGenerator.templates.infra'
import { generateCICardRender } from './codeGenerator.templates.ci'

export { generateCardWidget, generateStatWidget, generateTemplateWidget, generateMiniStatComponent } from './codeGenerator.widgets'

export interface TemplateHelpers {
  parseBlock: string
  wrapOpen: string
  wrapClose: string
  issueButton: string
  title: string
}

// Generate render function for specific card type
export function generateCardRenderFunction(cardType: string, displayName?: string): string {
  const card = WIDGET_CARDS[cardType]
  const title = displayName || card?.displayName || cardType

  // All render functions use ({ output }) pattern — Übersicht passes curl stdout as output string
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

  // Wrap card content in the draggable container
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

  const helpers: TemplateHelpers = { parseBlock, wrapOpen, wrapClose, issueButton, title }
  return (
    generateClusterCardRender(cardType, helpers) ??
    generateInfraCardRender(cardType, helpers) ??
    generateCICardRender(cardType, helpers) ??
    generateDefaultCardRender(helpers)
  )
}

function generateDefaultCardRender(helpers: TemplateHelpers): string {
  const { parseBlock, wrapOpen, wrapClose, issueButton, title } = helpers
  {
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
}
