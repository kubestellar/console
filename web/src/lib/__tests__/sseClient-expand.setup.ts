/**
 * Shared helpers for the split sseClient-expand.*.test.ts parts.
 * Not a test file itself — provides SSE stream/response builders used by
 * multiple split test parts to avoid duplicating them per-file.
 */

function makeSSEStream(events: Array<{ event: string; data: unknown }>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index < events.length) {
        const { event, data } = events[index]
        const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(chunk))
        index++
      } else {
        controller.close()
      }
    },
  })
}

function makeSplitSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]))
        index++
      } else {
        controller.close()
      }
    },
  })
}

export function makeSSEResponse(events: Array<{ event: string; data: unknown }>): Response {
  return new Response(makeSSEStream(events), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

export function makeSplitSSEResponse(chunks: string[]): Response {
  return new Response(makeSplitSSEStream(chunks), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}
