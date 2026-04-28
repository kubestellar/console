/**
 * KServe Status Card — Demo Data & Type Definitions
 *
 * KServe is a CNCF incubating model-serving platform on Kubernetes. It
 * surfaces ML / AI inference workloads as declarative `InferenceService`
 * custom resources. Each InferenceService manages a predictor (optionally
 * with a transformer and explainer) and exposes traffic-split canary
 * rollouts, replica autoscaling, and request-level metrics.
 *
 * This card surfaces:
 *  - Control plane (kserve-controller-manager) pod health
 *  - Inference service readiness (ready / not-ready / unknown)
 *  - Predictor replica status (ready/desired) + traffic split percentage
 *  - Serving throughput (requests/sec) and p95 latency
 *
 * Source: kubestellar/console-marketplace#38
 */

import { MS_PER_MINUTE } from '../constants/time'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KServeHealth = 'healthy' | 'degraded' | 'not-installed'
export type KServeServiceStatus = 'ready' | 'not-ready' | 'unknown'

export interface KServeControllerPods {
  /** Number of kserve-controller-manager pods reporting Ready. */
  ready: number
  /** Total number of kserve-controller-manager pods discovered. */
  total: number
}

export interface KServeService {
  /** Stable identifier suitable for React keys. */
  id: string
  /** InferenceService resource name. */
  name: string
  /** Kubernetes namespace. */
  namespace: string
  /** Cluster the InferenceService lives in. */
  cluster: string
  /** Reconciled readiness state derived from the Ready condition. */
  status: KServeServiceStatus
  /** Short name of the served model (e.g. "sklearn-iris"). */
  modelName: string
  /** ServingRuntime backing this predictor (e.g. "kserve-sklearnserver"). */
  runtime: string
  /** Public URL exposed by the predictor, if any. */
  url: string
  /** Canary traffic split in percent (0 - 100). */
  trafficPercent: number
  /** Predictor replicas currently ready. */
  readyReplicas: number
  /** Predictor replicas desired. */
  desiredReplicas: number
  /** Serving throughput as reported by the mesh / controller metrics. */
  requestsPerSecond: number
  /** p95 serving latency in milliseconds. */
  p95LatencyMs: number
  /** ISO timestamp of the last transition on the Ready condition. */
  updatedAt: string
}

export interface KServeSummary {
  totalServices: number
  readyServices: number
  notReadyServices: number
  totalRequestsPerSecond: number
  avgP95LatencyMs: number
}

export interface KServeStatusData {
  health: KServeHealth
  controllerPods: KServeControllerPods
  services: KServeService[]
  summary: KServeSummary
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo-data constants (named — no magic numbers)
// ---------------------------------------------------------------------------

// Relative "last update" offsets for each demo service — small, realistic ranges
// that exercise the formatRelativeTime helper in the card UI.
const DEMO_ONE_MINUTE_MS = 1 * MS_PER_MINUTE
const DEMO_FIVE_MINUTES_MS = 5 * MS_PER_MINUTE
const DEMO_TWELVE_MINUTES_MS = 12 * MS_PER_MINUTE
const DEMO_NINETY_MINUTES_MS = 90 * MS_PER_MINUTE

// Controller pod counts for the demo fleet (one replica is unready to exercise
// the degraded banner path).
const DEMO_CONTROLLER_PODS_READY = 2
const DEMO_CONTROLLER_PODS_TOTAL = 3

// Per-service demo constants — chosen so at least one service is DEGRADED,
// which lines up with kubestellar/console-marketplace#38 acceptance criteria
// (demo seed must exercise the degraded path).
const SKLEARN_IRIS_TRAFFIC_PERCENT = 100
const SKLEARN_IRIS_REPLICAS_READY = 2
const SKLEARN_IRIS_REPLICAS_DESIRED = 2
const SKLEARN_IRIS_RPS = 42.3
const SKLEARN_IRIS_P95_MS = 58

const TENSORFLOW_MNIST_TRAFFIC_PERCENT = 100
const TENSORFLOW_MNIST_REPLICAS_READY = 3
const TENSORFLOW_MNIST_REPLICAS_DESIRED = 3
const TENSORFLOW_MNIST_RPS = 186.7
const TENSORFLOW_MNIST_P95_MS = 74

// Degraded service: only 1/3 predictor replicas ready, so the Ready condition
// evaluates to False. This is the demo path that drives the degraded banner.
const TORCHSERVE_BERT_TRAFFIC_PERCENT = 80
const TORCHSERVE_BERT_REPLICAS_READY = 1
const TORCHSERVE_BERT_REPLICAS_DESIRED = 3
const TORCHSERVE_BERT_RPS = 12.4
const TORCHSERVE_BERT_P95_MS = 320

// Summary totals (precomputed so the demo seed is self-consistent).
const DEMO_READY_SERVICES = 2
const DEMO_NOT_READY_SERVICES = 1
const DEMO_TOTAL_RPS = Math.round(
  (SKLEARN_IRIS_RPS + TENSORFLOW_MNIST_RPS + TORCHSERVE_BERT_RPS) * 10,
) / 10
// Average p95 across the demo services — rounded to the nearest integer ms to
// match how the live fetcher reports it.
const DEMO_AVG_P95_MS = Math.round(
  (SKLEARN_IRIS_P95_MS + TENSORFLOW_MNIST_P95_MS + TORCHSERVE_BERT_P95_MS) / 3,
)

function relativeTimeIso(offsetMs: number): string {
  return new Date(Date.now() - offsetMs).toISOString()
}

// ---------------------------------------------------------------------------
// Demo data — shown when KServe is not installed or in demo mode
// ---------------------------------------------------------------------------

const DEMO_SERVICES: KServeService[] = [
  {
    id: 'isvc-prod-east-ml-serving-sklearn-iris',
    name: 'sklearn-iris',
    namespace: 'ml-serving',
    cluster: 'prod-east',
    status: 'ready',
    modelName: 'sklearn-iris',
    runtime: 'kserve-sklearnserver',
    url: 'http://sklearn-iris.ml-serving.example.com',
    trafficPercent: SKLEARN_IRIS_TRAFFIC_PERCENT,
    readyReplicas: SKLEARN_IRIS_REPLICAS_READY,
    desiredReplicas: SKLEARN_IRIS_REPLICAS_DESIRED,
    requestsPerSecond: SKLEARN_IRIS_RPS,
    p95LatencyMs: SKLEARN_IRIS_P95_MS,
    updatedAt: relativeTimeIso(DEMO_TWELVE_MINUTES_MS),
  },
  {
    id: 'isvc-prod-east-ml-serving-tensorflow-mnist',
    name: 'tensorflow-mnist',
    namespace: 'ml-serving',
    cluster: 'prod-east',
    status: 'ready',
    modelName: 'tensorflow-mnist',
    runtime: 'kserve-tensorflow',
    url: 'http://tensorflow-mnist.ml-serving.example.com',
    trafficPercent: TENSORFLOW_MNIST_TRAFFIC_PERCENT,
    readyReplicas: TENSORFLOW_MNIST_REPLICAS_READY,
    desiredReplicas: TENSORFLOW_MNIST_REPLICAS_DESIRED,
    requestsPerSecond: TENSORFLOW_MNIST_RPS,
    p95LatencyMs: TENSORFLOW_MNIST_P95_MS,
    updatedAt: relativeTimeIso(DEMO_FIVE_MINUTES_MS),
  },
  {
    id: 'isvc-prod-west-nlp-torchserve-bert',
    name: 'torchserve-bert',
    namespace: 'nlp',
    cluster: 'prod-west',
    status: 'not-ready',
    modelName: 'torchserve-bert',
    runtime: 'kserve-torchserve',
    url: 'http://torchserve-bert.nlp.example.com',
    trafficPercent: TORCHSERVE_BERT_TRAFFIC_PERCENT,
    readyReplicas: TORCHSERVE_BERT_REPLICAS_READY,
    desiredReplicas: TORCHSERVE_BERT_REPLICAS_DESIRED,
    requestsPerSecond: TORCHSERVE_BERT_RPS,
    p95LatencyMs: TORCHSERVE_BERT_P95_MS,
    updatedAt: relativeTimeIso(DEMO_NINETY_MINUTES_MS),
  },
]

export const KSERVE_DEMO_DATA: KServeStatusData = {
  health: 'degraded',
  controllerPods: {
    ready: DEMO_CONTROLLER_PODS_READY,
    total: DEMO_CONTROLLER_PODS_TOTAL,
  },
  services: DEMO_SERVICES,
  summary: {
    totalServices: DEMO_SERVICES.length,
    readyServices: DEMO_READY_SERVICES,
    notReadyServices: DEMO_NOT_READY_SERVICES,
    totalRequestsPerSecond: DEMO_TOTAL_RPS,
    avgP95LatencyMs: DEMO_AVG_P95_MS,
  },
  lastCheckTime: relativeTimeIso(DEMO_ONE_MINUTE_MS),
}

