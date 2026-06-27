/**
 * Card render function router for widget code generation
 */

import { WIDGET_CARDS } from '../widgetRegistry'
import { ISSUE_BUTTON, PARSE_BLOCK, WRAP_CLOSE, WRAP_OPEN } from './shared'
import { generateClusterCardRenderFunction } from './clusterCards'
import { generateInfrastructureCardRenderFunction } from './infrastructureCards'
import { generateCicdCardRenderFunction } from './cicdCards'

// Generate render function for specific card type
export function generateCardRenderFunction(cardType: string, displayName?: string): string {
  const card = WIDGET_CARDS[cardType]
  const title = displayName || card?.displayName || cardType

  return (
    generateClusterCardRenderFunction(cardType) ||
    generateInfrastructureCardRenderFunction(cardType) ||
    generateCicdCardRenderFunction(cardType) ||
    (() => {
      const safeTitleExpr = `{${JSON.stringify(title)}}`
      return `
export const render = ({ output }) => {${PARSE_BLOCK}

  if (error) {${WRAP_OPEN}
        <div style={styles.cardTitle}>${safeTitleExpr}</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${ISSUE_BUTTON}${WRAP_CLOSE}
  }
${WRAP_OPEN}
        <div style={styles.cardTitle}>${safeTitleExpr}</div>
        <pre style={{fontSize: '10px', overflow: 'auto', maxHeight: '100px'}}>
          {JSON.stringify(data, null, 2)}
        </pre>${WRAP_CLOSE}
};`
    })()
  )
}
