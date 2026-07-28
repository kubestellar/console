import { KC_AGENT } from '../../config/externalApis'

export const KC_AGENT_URL = KC_AGENT.url

export function buildBaseURLPayload(provider: string, draft: string):
  | { provider: string; clearBaseURL: true }
  | { provider: string; baseURL: string } {
  return draft === ''
    ? { provider, clearBaseURL: true }
    : { provider, baseURL: draft }
}
