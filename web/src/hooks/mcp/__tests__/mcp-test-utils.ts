export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, ...init })
}

export function pendingResponse(): Promise<Response> {
  return new Promise(() => {})
}
