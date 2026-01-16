const API_BASE = ''

class ApiClient {
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    const token = localStorage.getItem('token')
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    return headers
  }

  async get<T = any>(path: string): Promise<{ data: T }> {
    const headers = this.getHeaders()
    console.log(`[API] GET ${path}`, { hasAuth: !!headers['Authorization'] })
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'GET',
      headers,
    })
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      console.error(`[API] Error ${response.status}: ${errorText}`)
      if (response.status === 401) {
        // Clear invalid token
        console.warn('[API] Unauthorized - token may be expired')
      }
      throw new Error(`API error: ${response.status}`)
    }
    const data = await response.json()
    return { data }
  }

  async post<T = any>(path: string, body?: any): Promise<{ data: T }> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    const data = await response.json()
    return { data }
  }

  async put<T = any>(path: string, body?: any): Promise<{ data: T }> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    const data = await response.json()
    return { data }
  }

  async delete(path: string): Promise<void> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    })
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
  }
}

export const api = new ApiClient()
