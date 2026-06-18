/**
 * Card render function dispatch for Übersicht widgets.
 */

import { WIDGET_CARDS } from '../widgetRegistry'
import { generateCoreCardRender } from './cardRenderers-core'
import { generateOperationsCardRender } from './cardRenderers-ops'
import { generateGithubCardRender } from './cardRenderers-github'
import { buildCardRenderContext, generateDefaultCardRender } from './shared'

export function generateCardRenderFunction(cardType: string, displayName?: string): string {
  const card = WIDGET_CARDS[cardType]
  const title = displayName || card?.displayName || cardType
  const context = buildCardRenderContext(title, card ?? { displayName: title })

  return (
    generateCoreCardRender(cardType, context)
    ?? generateOperationsCardRender(cardType, context)
    ?? generateGithubCardRender(cardType, context)
    ?? generateDefaultCardRender(context)
  )
}
