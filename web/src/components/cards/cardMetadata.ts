// Card title and description registries — barrel re-export.
// Data is split across sibling files to keep each under the max-lines limit:
//   - cardTitles.ts        (CARD_TITLES)
//   - cardDescriptions.ts  (CARD_DESCRIPTIONS)
//   - cardDemoExempt.ts    (DEMO_EXEMPT_CARDS)
// Public exports are preserved — external callers keep importing from './cardMetadata'.

export { CARD_TITLES } from './cardTitles'
export { CARD_DESCRIPTIONS } from './cardDescriptions'
export { DEMO_EXEMPT_CARDS } from './cardDemoExempt'
