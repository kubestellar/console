import { AI_PROVIDER_DOCS } from '../../config/externalApis'

export interface KeyStatus {
  provider: string
  displayName: string
  configured: boolean
  source?: 'env' | 'config'
  valid?: boolean
  error?: string
  baseURL?: string
  baseURLEnvVar?: string
  baseURLSource?: 'env' | 'config'
}

export interface RegisteredProvider {
  name: string
  displayName: string
  description: string
  provider: string
  available: boolean
  capabilities: number
}

export interface KeysStatusResponse {
  keys: KeyStatus[]
  configPath: string
  registeredProviders?: RegisteredProvider[]
}

export const PROVIDER_INFO: Record<string, { docsUrl: string; placeholder: string }> = {
  'open-webui': {
    docsUrl: AI_PROVIDER_DOCS['open-webui'],
    placeholder: 'owui-...',
  },
  openrouter: {
    docsUrl: AI_PROVIDER_DOCS.openrouter,
    placeholder: 'sk-or-...',
  },
  groq: {
    docsUrl: AI_PROVIDER_DOCS.groq,
    placeholder: 'gsk_...',
  },
  ollama: {
    docsUrl: 'https://ollama.com',
    placeholder: 'Set OLLAMA_URL env var (no key needed)',
  },
  llamacpp: {
    docsUrl: 'https://github.com/ggml-org/llama.cpp',
    placeholder: 'Set LLAMACPP_URL env var (no key needed)',
  },
  localai: {
    docsUrl: 'https://localai.io',
    placeholder: 'Set LOCALAI_URL env var (no key needed)',
  },
  vllm: {
    docsUrl: 'https://docs.vllm.ai',
    placeholder: 'Set VLLM_URL env var (no key needed)',
  },
  'lm-studio': {
    docsUrl: 'https://lmstudio.ai',
    placeholder: 'Set LM_STUDIO_URL env var (no key needed)',
  },
  rhaiis: {
    docsUrl: 'https://docs.redhat.com/en/documentation/red_hat_ai_inference_server/',
    placeholder: 'Set RHAIIS_URL env var (no key needed)',
  },
}

export function providerToIconMap(provider: string): string {
  const map: Record<string, string> = {
    'open-webui': 'open-webui',
    openrouter: 'openrouter',
    groq: 'groq',
    ollama: 'ollama',
    llamacpp: 'llamacpp',
    localai: 'localai',
    vllm: 'vllm',
    'lm-studio': 'lm-studio',
    rhaiis: 'rhaiis',
  }
  return map[provider] || provider
}
