/** What the card requires to display live data */
export type CardRequirement = 'agent' | 'backend' | 'stack' | 'none'

/** Why the card is using demo data */
export type DemoReason =
  | 'global-demo-mode'      // User has demo mode enabled
  | 'agent-offline'         // Agent is not connected
  | 'endpoint-missing'      // Specific endpoint returned 404/error
  | 'stack-not-selected'    // Card requires a stack but none selected
  | 'demo-only-card'        // Card is demo-only (requires: 'none')
  | null                    // Not using demo data

export interface CardDemoStateOptions {
  /**
   * What the card requires to display live data:
   * - 'agent': Requires kc-agent to be connected (most cards)
   * - 'backend': Requires backend API (auth, user data)
   * - 'stack': Requires a stack to be selected (llm-d visualization cards)
   * - 'none': Demo-only card, always uses demo data
   */
  requires?: CardRequirement

  /**
   * Whether live data is actually available (e.g., endpoint returned data).
   * Set to false if the endpoint returned 404/error.
   * When undefined, assumed true (agent/backend handles the error).
   */
  isLiveDataAvailable?: boolean
}

export interface CardDemoStateResult {
  /** Whether the card should display demo data */
  shouldUseDemoData: boolean
  /** Why the card is using demo data (null if not using demo) */
  reason: DemoReason
  /**
   * Whether to show the demo badge/indicator in CardWrapper.
   * This is usually the same as shouldUseDemoData, but for stack-dependent cards
   * it's true when global demo mode is on (even if a stack is selected).
   */
  showDemoBadge: boolean
}
