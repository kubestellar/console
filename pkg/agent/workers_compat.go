package agent

// This file provides backward-compatible type aliases and delegations for
// the worker subsystems that were extracted to pkg/agent/workers/.
// Consumers of pkg/agent that referenced these types directly continue to
// compile without modification.

import "github.com/kubestellar/console/pkg/agent/workers"

// --- Prediction types ---

type PredictionWorker = workers.PredictionWorker
type PredictionSettings = workers.PredictionSettings
type AIPrediction = workers.AIPrediction
type AIPredictionsResponse = workers.AIPredictionsResponse
type AIAnalysisRequest = workers.AIAnalysisRequest
type ClusterAnalysisData = workers.ClusterAnalysisData
type ClusterSummary = workers.ClusterSummary
type PodIssueSummary = workers.PodIssueSummary
type GPUNodeSummary = workers.GPUNodeSummary
type NodeSummary = workers.NodeSummary

// --- Insight types ---

type InsightWorker = workers.InsightWorker
type InsightEnrichmentRequest = workers.InsightEnrichmentRequest
type InsightSummary = workers.InsightSummary
type AIInsightEnrichment = workers.AIInsightEnrichment
type InsightEnrichmentResponse = workers.InsightEnrichmentResponse

// --- Device Tracker types ---

type DeviceTracker = workers.DeviceTracker
type DeviceCounts = workers.DeviceCounts
type DeviceSnapshot = workers.DeviceSnapshot
type DeviceAlert = workers.DeviceAlert
type DeviceAlertsResponse = workers.DeviceAlertsResponse
type NodeDeviceInventory = workers.NodeDeviceInventory
type DeviceInventoryResponse = workers.DeviceInventoryResponse

// --- Metrics History types ---

type MetricsHistory = workers.MetricsHistory
type MetricsSnapshot = workers.MetricsSnapshot
type ClusterMetricSnapshot = workers.ClusterMetricSnapshot
type PodIssueSnapshot = workers.PodIssueSnapshot
type GPUNodeMetricSnapshot = workers.GPUNodeMetricSnapshot
type MetricsHistoryResponse = workers.MetricsHistoryResponse

// --- Constants ---

const InsightEnrichmentCacheTTL = workers.InsightEnrichmentCacheTTL
const InsightEnrichmentTimeout = workers.InsightEnrichmentTimeout

// --- Constructor delegations ---

var NewPredictionWorker = workers.NewPredictionWorker
var NewInsightWorker = workers.NewInsightWorker
var NewDeviceTracker = workers.NewDeviceTracker
var NewMetricsHistory = workers.NewMetricsHistory
var DefaultPredictionSettings = workers.DefaultPredictionSettings

// --- Metrics ---

var InitPredictionMetrics = workers.InitPredictionMetrics
var RecordPrediction = workers.RecordPrediction
var SetActivePredictions = workers.SetActivePredictions
var RecordFeedback = workers.RecordFeedback
var RecordAnalysisDuration = workers.RecordAnalysisDuration
var RecordAnalysisError = workers.RecordAnalysisError
var RecordMetricsSnapshot = workers.RecordMetricsSnapshot
var GetMetricsHandler = workers.GetMetricsHandler
