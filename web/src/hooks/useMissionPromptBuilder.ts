/**
 * Prompt-enhancement utilities for the mission system.
 *
 * Extracted from useMissions.tsx (#8624) to reduce the file size and improve
 * TypeScript type-checking performance.
 *
 * These are pure functions (no React hooks, no side effects) that transform
 * mission parameters into enriched prompts and system messages.
 */

import { detectIssueSignature, findSimilarResolutionsStandalone, generateResolutionPromptContext } from './useResolutions'
import type { Mission, MissionMessage, MatchedResolution, StartMissionParams } from './useMissionTypes'

/**
 * Generate a unique message ID using a monotonic counter + timestamp.
 *
 * #7311 — Replaces bare `msg-${Date.now()}` which collides when two messages
 * are created in the same millisecond (e.g., rapid stream splits,
 * system messages added back-to-back).
 *
 * NOTE: The counter is module-level so it is shared across all callers that
 * import this function. This is intentional — it guarantees uniqueness even
 * across concurrent missions in the same tab.
 */
let messageIdCounter = 0
export function generateMessageId(suffix = ''): string {
  messageIdCounter += 1
  return `msg-${Date.now()}-${messageIdCounter}${suffix ? `-${suffix}` : ''}`
}

/**
 * Shared prompt-enhancement pipeline: cluster targeting, dry-run injection,
 * non-interactive terminal handling, and resolution matching.
 * Used by both startMission and runSavedMission to avoid duplication (#4768).
 */
export function buildEnhancedPrompt(params: StartMissionParams): {
  enhancedPrompt: string
  matchedResolutions: MatchedResolution[]
  isInstallMission: boolean
} {
  // Inject cluster targeting into the prompt sent to the agent
  let enhancedPrompt = params.initialPrompt
  if (params.cluster) {
    const clusterList = params.cluster.split(',').map(c => c.trim()).filter(Boolean)
    if (clusterList.length === 1) {
      enhancedPrompt = `Target cluster: ${clusterList[0]}\nIMPORTANT: All kubectl commands MUST use --context=${clusterList[0]}\n\n${enhancedPrompt}`
    } else {
      // #7188/#7198 — Inject explicit per-cluster context instructions so
      // the agent uses the correct kubectl context for each cluster instead
      // of defaulting to the first one.
      const perClusterInstructions = clusterList
        .map((c, i) => `  ${i + 1}. Cluster "${c}": use --context=${c}`)
        .join('\n')
      enhancedPrompt = `Target clusters: ${clusterList.join(', ')}\nIMPORTANT: Perform the following on EACH cluster using its respective kubectl context:\n${perClusterInstructions}\n\n${enhancedPrompt}`
    }
  }

  // Inject dry-run instructions for server-side validation without actual changes
  if (params.dryRun) {
    enhancedPrompt += '\n\nCRITICAL — DRY RUN MODE:\n' +
      'This is a DRY RUN deployment. You MUST NOT create, modify, or delete any actual resources.\n' +
      'For every kubectl apply, create, or delete command, append --dry-run=server to perform server-side validation only.\n' +
      'For every helm install or helm upgrade command, append --dry-run to simulate without installing.\n' +
      'Report what WOULD be deployed, including:\n' +
      '- Resources that would be created (with their kinds, names, and namespaces)\n' +
      '- Any validation errors the server returns\n' +
      '- Any missing prerequisites (CRDs, namespaces, RBAC)\n' +
      'Conclude with a summary: "DRY RUN COMPLETE — N resources validated, M errors found."\n'
  }

  // Remind the agent that it runs in a non-interactive terminal (no stdin).
  // This prevents commands that prompt for user input from hanging (#3767).
  const isInstallMission = params.type === 'deploy' || /install/i.test(params.title)
  if (isInstallMission) {
    enhancedPrompt += '\n\nIMPORTANT: You are running in a non-interactive terminal with NO stdin support. ' +
      'Never run commands that require interactive input (login prompts, confirmation dialogs, browser OAuth flows). ' +
      'Always use non-interactive flags (--yes, -y, --non-interactive, --no-input, --batch) or pipe "yes" where needed. ' +
      'If a step requires interactive authentication, stop and tell the user to complete it manually in their own terminal first.'
  }

  // Auto-match and inject resolution context for relevant mission types
  let matchedResolutions: MatchedResolution[] = []

  // Match resolutions for troubleshooting-related missions (not deploy/upgrade)
  if (params.type !== 'deploy' && params.type !== 'upgrade') {
    // Detect issue signature from mission content
    const content = `${params.title} ${params.description} ${params.initialPrompt}`
    const signature = detectIssueSignature(content)

    if (signature.type && signature.type !== 'Unknown') {
      // Find similar resolutions from history
      const similarResolutions = findSimilarResolutionsStandalone(
        { type: signature.type, resourceKind: signature.resourceKind, errorPattern: signature.errorPattern },
        { minSimilarity: 0.4, limit: 3 }
      )

      if (similarResolutions.length > 0) {
        // Store matched resolutions for display
        matchedResolutions = similarResolutions.map(sr => ({
          id: sr.resolution.id,
          title: sr.resolution.title,
          similarity: sr.similarity,
          source: sr.source }))

        // Inject resolution context into the prompt
        const resolutionContext = generateResolutionPromptContext(similarResolutions)
        enhancedPrompt = params.initialPrompt + resolutionContext
      }
    }
  }

  return { enhancedPrompt, matchedResolutions, isInstallMission }
}

/**
 * Build system messages for non-interactive mode and auto-matched resolutions.
 * Shared between startMission and runSavedMission (#4768).
 */
export function buildSystemMessages(
  isInstallMission: boolean,
  matchedResolutions: MatchedResolution[],
): MissionMessage[] {
  const messages: MissionMessage[] = []

  // Warn the user that interactive terminal input is not supported (#3767)
  if (isInstallMission) {
    messages.push({
      id: generateMessageId('nointeractive'),
      role: 'system',
      content: '**Non-interactive mode:** This terminal does not support interactive input. ' +
        'If a tool requires browser-based login or manual confirmation, the agent will ask you to run that step in your own terminal first.',
      timestamp: new Date() })
  }

  // Add system message if resolutions were auto-matched
  if (matchedResolutions.length > 0) {
    const resolutionNames = matchedResolutions.map(r =>
      `• **${r.title}** (${Math.round(r.similarity * 100)}% match, ${r.source === 'personal' ? 'your history' : 'team knowledge'})`
    ).join('\n')

    messages.push({
      id: generateMessageId('resolutions'),
      role: 'system',
      content: `🔍 **Found ${matchedResolutions.length} similar resolution${matchedResolutions.length > 1 ? 's' : ''} from your knowledge base:**\n\n${resolutionNames}\n\n_This context has been automatically provided to the AI to help solve the problem faster._`,
      timestamp: new Date() })
  }

  return messages
}

/**
 * Strip interactive terminal prompt artifacts from agent metadata strings (#5482).
 * Interactive agents (e.g. copilot-cli) sometimes leak prompt text, ANSI escape
 * codes, or selection indicators into their description or displayName fields.
 */
export function stripInteractiveArtifacts(text: string): string {
  if (!text) return text
  return text
    // Remove ANSI escape codes (colors, cursor movement, etc.)
    // eslint-disable-next-line no-control-regex
    .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
    // Remove interactive prompt indicators (? prompt, > selection, etc.)
    .replace(/^[?>]\s+/gm, '')
    // Remove lines that look like interactive menu items
    .replace(/^\s*[-*]\s+\[.\]\s+/gm, '')
    // Remove carriage returns and excess whitespace
    .replace(/\r/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/**
 * Build a base prompt from saved mission data for use in runSavedMission.
 */
export function buildSavedMissionPrompt(mission: Pick<Mission, 'description' | 'importedFrom'>): string {
  return mission.importedFrom?.steps
    ? `${mission.description}\n\nSteps:\n${mission.importedFrom.steps.map((s, i) => `${i + 1}. ${s.title}: ${s.description}`).join('\n')}`
    : mission.description
}
