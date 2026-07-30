import { useState } from 'react'
import { Layers, Code } from 'lucide-react'
import { cn } from '../../lib/cn'
import { saveDynamicCard } from '../../lib/dynamic-cards'
import { compileCardCode } from '../../lib/dynamic-cards/compiler'
import type {
  DynamicCardDefinition,
  DynamicCardDefinition_T1 } from '../../lib/dynamic-cards/types'
import { registerDynamicCardType } from '../cards/cardRegistry'
import { AiGenerationPanel } from './AiGenerationPanel'
import { CARD_T1_SYSTEM_PROMPT, CARD_T2_SYSTEM_PROMPT } from '../../lib/ai/prompts'
import { T1Preview, T2Preview } from './cardFactoryPreviews'
import {
  validateT1Result,
  validateT2Result,
  type AiCardT1Result,
  type AiCardT2Result,
  type AiMode } from './cardFactoryAiTypes'

const DEFAULT_T1_LIMIT = 5 // Default row limit for tier-1 cards when AI omits defaultLimit
const DEFAULT_CARD_WIDTH = 6 // Default grid width (out of 12) when AI omits defaultWidth

/**
 * AI tab content for the Card Factory modal.
 *
 * Lets users describe a card in natural language and have an AI assistant
 * generate either a Tier-1 declarative definition or a Tier-2 custom-code
 * React component. Wraps {@link AiGenerationPanel} for both flows and
 * persists the generated card via {@link saveDynamicCard} +
 * {@link registerDynamicCardType}.
 */
export function AiCardTab({ onCardCreated }: { onCardCreated: (id: string) => void }) {
  const [aiMode, setAiMode] = useState<AiMode>('tier1')

  const handleSaveT1 = (result: AiCardT1Result) => {
    const id = `dynamic_${Date.now()}`
    const now = new Date().toISOString()

    const cardDef: DynamicCardDefinition_T1 = {
      dataSource: 'static',
      staticData: result.staticData || [],
      columns: result.columns,
      layout: result.layout || 'list',
      searchFields: result.searchFields || result.columns.map(c => c.field),
      defaultLimit: result.defaultLimit || DEFAULT_T1_LIMIT }

    const def: DynamicCardDefinition = {
      id,
      title: result.title,
      tier: 'tier1',
      description: result.description || undefined,
      defaultWidth: result.defaultWidth || DEFAULT_CARD_WIDTH,
      createdAt: now,
      updatedAt: now,
      cardDefinition: cardDef }

    saveDynamicCard(def)
    registerDynamicCardType(id, result.defaultWidth || DEFAULT_CARD_WIDTH)
    onCardCreated(id)
  }

  const handleSaveT2 = async (result: AiCardT2Result) => {
    const compileResult = await compileCardCode(result.sourceCode)
    if (compileResult.error) {
      throw new Error(`Compile error: ${compileResult.error}`)
    }

    const id = `dynamic_${Date.now()}`
    const now = new Date().toISOString()

    const def: DynamicCardDefinition = {
      id,
      title: result.title,
      tier: 'tier2',
      description: result.description || undefined,
      defaultWidth: result.defaultWidth || DEFAULT_CARD_WIDTH,
      createdAt: now,
      updatedAt: now,
      sourceCode: result.sourceCode,
      compiledCode: compileResult.code! }

    saveDynamicCard(def)
    registerDynamicCardType(id, result.defaultWidth || DEFAULT_CARD_WIDTH)
    onCardCreated(id)
  }

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Card Type</label>
        <div className="flex gap-2">
          <button
            onClick={() => setAiMode('tier1')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors',
              aiMode === 'tier1'
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-secondary text-muted-foreground hover:text-foreground',
            )}
          >
            <Layers className="w-3 h-3" />
            Declarative (table/list)
          </button>
          <button
            onClick={() => setAiMode('tier2')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors',
              aiMode === 'tier2'
                ? 'bg-purple-500/20 text-purple-400'
                : 'bg-secondary text-muted-foreground hover:text-foreground',
            )}
          >
            <Code className="w-3 h-3" />
            Custom Code (React)
          </button>
        </div>
      </div>

      {/* AI Generation Panel */}
      {aiMode === 'tier1' ? (
        <AiGenerationPanel<AiCardT1Result>
          systemPrompt={CARD_T1_SYSTEM_PROMPT}
          placeholder="Describe the card you want, e.g., 'A card showing deployment status across clusters with name, namespace, replicas, and status columns'"
          missionTitle="AI Card Generation (Declarative)"
          validateResult={validateT1Result}
          renderPreview={(result) => <T1Preview result={result} />}
          onSave={handleSaveT1}
          saveLabel="Create Declarative Card"
        />
      ) : (
        <AiGenerationPanel<AiCardT2Result>
          systemPrompt={CARD_T2_SYSTEM_PROMPT}
          placeholder="Describe the card you want, e.g., 'A card with animated donut chart showing cluster health percentages with color-coded segments'"
          missionTitle="AI Card Generation (Custom Code)"
          validateResult={validateT2Result}
          renderPreview={(result) => <T2Preview result={result} />}
          onSave={handleSaveT2}
          saveLabel="Create Custom Code Card"
        />
      )}
    </div>
  )
}
