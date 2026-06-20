/* eslint-disable max-lines -- TODO: split this file (tracked by #15790) */
/**
 * LLM-d Stack Discovery Hook
 *
 * Discovers llm-d stacks from Kubernetes clusters by finding:
 * - Pods with llm-d.ai/role labels (prefill/decode/both)
 * - InferencePool CRDs
 * - Deployments matching LLM-d name/label/namespace patterns (broad discovery)
 * - EPP and Gateway services
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { kubectlProxy } from '../lib/kubectlProxy'
import { getDemoMode } from './useDemoMode'
import type { LLMdServer } from './useLLMd'
import { DEFAULT_REFRESH_INTERVAL_MS as REFRESH_INTERVAL_MS } from '../lib/constants'
import { KUBECTL_MEDIUM_TIMEOUT_MS, KUBECTL_EXTENDED_TIMEOUT_MS } from '../lib/constants/network'
import { MS_PER_MINUTE } from '../lib/constants/time'

const CACHE_KEY = 'kubestellar-stack-cache'
const CACHE_TTL_MS = 5 * MS_PER_MINUTE // 5 minutes

function safeJsonParse<T>(value: string, fallback: T, context: string): T {
  try {
    return JSON.parse(value) as T
  } catch (err) {
    console.warn(`[useStackDiscovery] Ignoring malformed JSON for ${context}:`, err)
    return fallback
  }
}