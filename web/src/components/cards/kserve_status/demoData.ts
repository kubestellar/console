/**
 * Demo data for the KServe monitoring card.
 *
 * Represents a multi-cluster model serving setup with healthy and degraded
 * InferenceServices. Used in demo mode and when live KServe APIs are not
 * available.
 */

const ONE_MINUTE_MS = 60 * 1000
const TEN_MINUTES_MS = 10 * ONE_MINUTE_MS
const THIRTY_MINUTES_MS = 30 * ONE_MINUTE_MS
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS
const TWO_HOURS_MS = 2 * ONE_HOUR_MS

export type KServeHealth = 'healthy' | 'degraded' | 'not-installed'
export type KServeServiceStatus = 'ready' | 'not-ready' | 'unknown'

export interface KServeService {
  id: string
  name: string
  namespace: string
  cluster: string
  status: KServeServiceStatus
  modelName: string
  runtime: string
  url: string
  trafficPercent: number
  readyReplicas: number
  desiredReplicas: number
  requestsPerSecond: number
  p95LatencyMs: number
  updatedAt: string
}

export interface KServeDemoData {
  health: KServeHealth
  controllerPods: {
    ready: number
    total: number
  }
  services: KServeService[]
  totalRequestsPerSecond: number
  avgP95LatencyMs: number
  lastCheckTime: string
}

export const KSERVE_DEMO_DATA: KServeDemoData = {
  health: 'degraded',
  controllerPods: { ready: 2, total: 3 },
  services: [
    {
      id: 'svc-eks-prod-ml-fraud-detector',
      name: 'fraud-detector',
      namespace: 'ml-serving',
      cluster: 'eks-prod-us-east-1',
      status: 'ready',
      modelName: 'xgboost-fraud-v3',
      runtime: 'kserve-tritonserver',
      url: 'http://fraud-detector.ml-serving.example.com',
      trafficPercent: 100,
      readyReplicas: 3,
      desiredReplicas: 3,
      requestsPerSecond: 148.7,
      p95LatencyMs: 86,
      updatedAt: new Date(Date.now() - TEN_MINUTES_MS).toISOString(),
    },
    {
      id: 'svc-eks-prod-ml-reco-ranker',
      name: 'reco-ranker',
      namespace: 'ml-serving',
      cluster: 'eks-prod-us-east-1',
      status: 'ready',
      modelName: 'llm-ranker-v2',
      runtime: 'kserve-huggingfaceserver',
      url: 'http://reco-ranker.ml-serving.example.com',
      trafficPercent: 80,
      readyReplicas: 6,
      desiredReplicas: 6,
      requestsPerSecond: 321.4,
      p95LatencyMs: 112,
      updatedAt: new Date(Date.now() - THIRTY_MINUTES_MS).toISOString(),
    },
    {
      id: 'svc-eks-prod-ml-reco-ranker-canary',
      name: 'reco-ranker-canary',
      namespace: 'ml-serving',
      cluster: 'eks-prod-us-east-1',
      status: 'unknown',
      modelName: 'llm-ranker-v3-canary',
      runtime: 'kserve-huggingfaceserver',
      url: 'http://reco-ranker.ml-serving.example.com',
      trafficPercent: 20,
      readyReplicas: 1,
      desiredReplicas: 2,
      requestsPerSecond: 57.1,
      p95LatencyMs: 173,
      updatedAt: new Date(Date.now() - ONE_HOUR_MS).toISOString(),
    },
    {
      id: 'svc-gke-staging-vision-object-detector',
      name: 'vision-object-detector',
      namespace: 'vision',
      cluster: 'gke-staging-eu-west-1',
      status: 'not-ready',
      modelName: 'yolov8-edge',
      runtime: 'kserve-mlserver',
      url: 'http://vision-object-detector.vision.example.com',
      trafficPercent: 100,
      readyReplicas: 0,
      desiredReplicas: 2,
      requestsPerSecond: 0,
      p95LatencyMs: 0,
      updatedAt: new Date(Date.now() - TWO_HOURS_MS).toISOString(),
    },
    {
      id: 'svc-aks-eval-nlp-sentiment',
      name: 'nlp-sentiment',
      namespace: 'experiments',
      cluster: 'aks-eval-ap-south-1',
      status: 'ready',
      modelName: 'bert-sentiment-v5',
      runtime: 'kserve-sklearnserver',
      url: 'http://nlp-sentiment.experiments.example.com',
      trafficPercent: 100,
      readyReplicas: 2,
      desiredReplicas: 2,
      requestsPerSecond: 42.8,
      p95LatencyMs: 64,
      updatedAt: new Date(Date.now() - THIRTY_MINUTES_MS).toISOString(),
    },
  ],
  totalRequestsPerSecond: 570,
  avgP95LatencyMs: 109,
  lastCheckTime: new Date(Date.now() - ONE_MINUTE_MS).toISOString(),
}
