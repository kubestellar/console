import { useCallback, useEffect, useState } from 'react'
import { api, RateLimitError } from '../../lib/api'
import { MIN_PERCEIVED_DELAY_MS } from '../../lib/constants/network'
import { DEMO_FEATURE_REQUESTS, FEEDBACK_ATTACHMENT_LIMIT_ERROR, type CloseRequestInput, type CreateFeatureRequestInput, type FeatureRequest, type PRFeedback, type ReopenRequestInput, type RequestStatus, type SubmitFeedbackInput } from './types'
import { isDemoUser, isFeedbackBodyLimitError, sortRequests, CACHE_TTL_MS } from './utils'

export interface UseFeatureRequestsOptions {
  countOnly?: boolean
}

export interface FeatureRequestSummary {
  id: string
  status: RequestStatus
}

export function useFeatureRequests(currentUserId?: string, options?: UseFeatureRequestsOptions) {
  const [requests, setRequests] = useState<FeatureRequest[]>([])
  const [summaries, setSummaries] = useState<FeatureRequestSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const countOnly = options?.countOnly === true

  useEffect(() => {
    isDemoUser().then(setIsDemoMode)
  }, [])

  const loadRequests = useCallback(async () => {
    if (isDemoMode) {
      if (countOnly) {
        setSummaries(DEMO_FEATURE_REQUESTS.map(request => ({ id: request.id, status: request.status })))
      } else {
        const sorted = currentUserId ? sortRequests(DEMO_FEATURE_REQUESTS, currentUserId) : DEMO_FEATURE_REQUESTS
        setRequests(sorted)
      }
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      if (countOnly) {
        const { data } = await api.get<FeatureRequestSummary[]>('/api/feedback/queue?count_only=true')
        setSummaries(Array.isArray(data) ? data : [])
      } else {
        const { data } = await api.get<FeatureRequest[]>('/api/feedback/queue')
        const safeData = Array.isArray(data) ? data : []
        const sorted = currentUserId ? sortRequests(safeData, currentUserId) : safeData
        setRequests(sorted)
      }
      setError(null)
    } catch {
      // backend may be unavailable
    } finally {
      setIsLoading(false)
    }
  }, [countOnly, currentUserId, isDemoMode])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  useEffect(() => {
    if (isDemoMode) return undefined

    const interval = setInterval(() => {
      const hasPending = requests.some(request => request.status !== 'closed' && request.status !== 'fix_complete')
      if (hasPending) {
        loadRequests()
      }
    }, CACHE_TTL_MS)

    return () => clearInterval(interval)
  }, [isDemoMode, loadRequests, requests])

  const refresh = async () => {
    setIsRefreshing(true)
    const minDelay = new Promise(resolve => setTimeout(resolve, MIN_PERCEIVED_DELAY_MS))
    await Promise.all([loadRequests(), minDelay])
    setIsRefreshing(false)
  }

  const createRequest = async (input: CreateFeatureRequestInput, requestOptions?: { timeout?: number }) => {
    try {
      setIsSubmitting(true)
      const { data } = await api.post<FeatureRequest>('/api/feedback/requests', input, requestOptions)
      setRequests(prev => [data, ...prev])
      return data
    } catch (err: unknown) {
      if (err instanceof RateLimitError) {
        throw new Error('Too many requests — please wait a moment and try again.')
      }
      if (err instanceof Error && isFeedbackBodyLimitError(err.message)) {
        throw new Error(FEEDBACK_ATTACHMENT_LIMIT_ERROR)
      }
      throw err
    } finally {
      setIsSubmitting(false)
    }
  }

  const getRequest = async (id: string) => {
    const { data } = await api.get<FeatureRequest>(`/api/feedback/requests/${id}`)
    return data
  }

  const submitFeedback = async (requestId: string, input: SubmitFeedbackInput) => {
    const { data } = await api.post<PRFeedback>(`/api/feedback/requests/${requestId}/feedback`, input)
    return data
  }

  const requestUpdate = async (requestId: string) => {
    const { data } = await api.post<FeatureRequest>(`/api/feedback/requests/${requestId}/request-update`)
    setRequests(prev => prev.map(request => request.id === requestId ? data : request))
    return data
  }

  const closeRequest = async (requestId: string, input: CloseRequestInput = {}) => {
    const { data } = await api.patch<FeatureRequest>(`/api/feedback/${requestId}/close`, input)
    setRequests(prev => prev.map(request => request.id === requestId ? data : request))
    return data
  }

  const reopenRequest = async (requestId: string, input: ReopenRequestInput) => {
    const { data } = await api.post<FeatureRequest>(`/api/feedback/${requestId}/reopen`, input)
    setRequests(prev => prev.map(request => request.id === requestId ? data : request))
    return data
  }

  return {
    requests,
    summaries,
    isLoading,
    isRefreshing,
    error,
    isSubmitting,
    isDemoMode,
    loadRequests,
    refresh,
    createRequest,
    getRequest,
    submitFeedback,
    requestUpdate,
    closeRequest,
    reopenRequest,
  }
}
