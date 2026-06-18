import { http, HttpResponse, delay } from 'msw'
import {
  pruneRegistry,
  savedCards,
  DEMO_30_SEC_MS,
  DEMO_45_SEC_MS,
  DEMO_1_MIN_MS,
  DEMO_90_SEC_MS,
  DEMO_2_MIN_MS,
  DEMO_150_SEC_MS,
  DEMO_3_MIN_MS,
  DEMO_4_MIN_MS,
  DEMO_5_MIN_MS,
  DEMO_6_MIN_MS,
  DEMO_7_MIN_MS,
  DEMO_8_MIN_MS,
  DEMO_10_MIN_MS,
  DEMO_15_MIN_MS,
  DEMO_20_MIN_MS,
  DEMO_30_MIN_MS,
  DEMO_45_MIN_MS,
  DEMO_50_MIN_MS,
  DEMO_1_HOUR_MS,
  DEMO_75_MIN_MS,
  DEMO_90_MIN_MS,
  DEMO_2_HOUR_MS,
  DEMO_150_MIN_MS,
  DEMO_3_HOUR_MS,
  DEMO_4_HOUR_MS,
  DEMO_8_HOUR_MS,
  DEMO_12_HOUR_MS,
  DEMO_1_DAY_MS,
  DEMO_2_DAY_MS,
  DEMO_3_DAY_MS,
  DEMO_1_WEEK_MS,
  DEMO_30_DAY_MS,
} from './handlers.fixtures'

export function createCardsHandlers() {
  return [
  http.get('/api/cards/templates', async () => {
    await delay(100)
    return HttpResponse.json({
      templates: [
        { id: 'cluster_health', name: 'Cluster Health', category: 'monitoring' },
        { id: 'pod_issues', name: 'Pod Issues', category: 'issues' },
        { id: 'deployment_issues', name: 'Deployment Issues', category: 'issues' },
        { id: 'gpu_overview', name: 'GPU Overview', category: 'resources' },
        { id: 'gpu_status', name: 'GPU Status', category: 'resources' },
        { id: 'event_stream', name: 'Event Stream', category: 'activity' },
        { id: 'resource_usage', name: 'Resource Usage', category: 'resources' },
        { id: 'security_issues', name: 'Security Issues', category: 'security' },
      ],
    })
  }),

  http.post('/api/cards/save', async ({ request }) => {
    await delay(100)
    const body = (await request.json()) as { id: string; config: unknown }
    const shareId = `card-${Date.now()}`
    savedCards[shareId] = body
    pruneRegistry(savedCards)
    return HttpResponse.json({
      success: true,
      shareId,
      shareUrl: `/shared/card/${shareId}`,
    })
  }),

  http.get('/api/cards/shared/:shareId', async ({ params }) => {
    await delay(100)
    const card = savedCards[params.shareId as string]
    if (card) {
      return HttpResponse.json({ card })
    }
    return HttpResponse.json({ error: 'Card not found' }, { status: 404 })
  }),
  ]
}
