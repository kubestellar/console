import { getStoredAuthToken } from '../../lib/authToken'

export async function agentAuthHeaders(): Promise<Record<string, string>> {
  const token = await getStoredAuthToken()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}
