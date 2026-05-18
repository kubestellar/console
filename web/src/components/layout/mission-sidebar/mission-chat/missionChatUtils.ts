import type { Mission, MissionMessage } from '../../../../hooks/useMissions'

export interface ConversationSummary {
  exchanges: number
  status: Mission['status']
  lastUpdate: Mission['updatedAt']
  keyPoints: string[]
  hasToolExecution: boolean
}

export function getMissionAgentProvider(agent?: string): string | undefined {
  if (!agent) return undefined

  return agent === 'claude' ? 'anthropic' :
    agent === 'openai' ? 'openai' :
    agent === 'gemini' ? 'google' :
    agent === 'bob' ? 'bob' :
    agent === 'claude-code' ? 'anthropic-local' :
    agent
}

export function buildMissionTranscript(mission: Mission, missionMessages: MissionMessage[]): string {
  const lines: string[] = [
    `# Mission: ${mission.title}`,
    '',
    `**Type:** ${mission.type}`,
    `**Status:** ${mission.status}`,
    `**Started:** ${mission.createdAt.toLocaleString()}`,
    mission.agent ? `**Agent:** ${mission.agent}` : '',
    mission.cluster ? `**Cluster:** ${mission.cluster}` : '',
    '',
    '---',
    '',
    '## Conversation',
    '',
  ]

  for (const message of missionMessages) {
    const timestamp = message.timestamp.toLocaleString()

    if (message.role === 'user') {
      lines.push(`### User (${timestamp})`)
      lines.push('')
      lines.push(message.content)
      lines.push('')
      continue
    }

    if (message.role === 'assistant') {
      lines.push(`### ${message.agent || mission.agent || 'Assistant'} (${timestamp})`)
      lines.push('')
      lines.push(message.content)
      lines.push('')
      continue
    }

    if (message.role === 'system') {
      lines.push(`### System (${timestamp})`)
      lines.push('')
      lines.push(`> ${message.content}`)
      lines.push('')
    }
  }

  return lines.filter((line) => line !== undefined).join('\n')
}

export function getOriginalAsk(mission: Mission, missionMessages: MissionMessage[]): string {
  const firstUserMessage = missionMessages.find((message) => message.role === 'user')
  return firstUserMessage?.content || mission.description
}

export function getConversationSummary(mission: Mission, missionMessages: MissionMessage[]): ConversationSummary {
  const userMessages = missionMessages.filter((message) => message.role === 'user')
  const assistantMessages = missionMessages.filter((message) => message.role === 'assistant')
  const lastAssistantMessage = assistantMessages[assistantMessages.length - 1]

  let keyPoints: string[] = []
  if (lastAssistantMessage) {
    const bullets = lastAssistantMessage.content.match(/^[-\u2022*]\s+.+$/gm) || []
    const numbered = lastAssistantMessage.content.match(/^\d+\.\s+.+$/gm) || []
    keyPoints = [...bullets, ...numbered].slice(0, 3).map((line) => line.replace(/^[-\u2022*\d.]\s+/, ''))
  }

  return {
    exchanges: Math.min(userMessages.length, assistantMessages.length),
    status: mission.status,
    lastUpdate: mission.updatedAt,
    keyPoints,
    hasToolExecution: assistantMessages.some((message) =>
      message.content.includes('```') && (message.content.includes('kubectl') || message.content.includes('executed'))
    ),
  }
}
