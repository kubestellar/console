import type { HeadersInit } from 'react'

export function buildQuantumMutationHeaders(token: string | null): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  }
  if (token) {
    headers.Authorization = '******'
  }
  return headers
}
