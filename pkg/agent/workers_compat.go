package agent

// This file provides backward-compatible type aliases for the worker
// subsystems extracted to pkg/agent/workers/. Only symbols that are
// actually referenced outside the workers package are kept here.

import "github.com/kubestellar/console/pkg/agent/workers"

// --- Prediction types ---

type PredictionWorker = workers.PredictionWorker
type PredictionSettings = workers.PredictionSettings
type AIPrediction = workers.AIPrediction
type AIPredictionsResponse = workers.AIPredictionsResponse
type AIAnalysisRequest = workers.AIAnalysisRequest

// --- Insight types ---

type InsightWorker = workers.InsightWorker
type InsightSummary = workers.InsightSummary
type InsightEnrichmentRequest = workers.InsightEnrichmentRequest
type AIInsightEnrichment = workers.AIInsightEnrichment
type InsightEnrichmentResponse = workers.InsightEnrichmentResponse

// --- Device Tracker types ---

type DeviceTracker = workers.DeviceTracker
type DeviceAlert = workers.DeviceAlert
type DeviceAlertsResponse = workers.DeviceAlertsResponse
type NodeDeviceInventory = workers.NodeDeviceInventory
type DeviceInventoryResponse = workers.DeviceInventoryResponse

// --- Metrics History types ---

type MetricsHistory = workers.MetricsHistory
type MetricsSnapshot = workers.MetricsSnapshot
type MetricsHistoryResponse = workers.MetricsHistoryResponse

// --- Constants ---

const InsightEnrichmentCacheTTL = workers.InsightEnrichmentCacheTTL
const InsightEnrichmentTimeout = workers.InsightEnrichmentTimeout

// --- Constructor delegations ---

var NewPredictionWorker = workers.NewPredictionWorker
var NewInsightWorker = workers.NewInsightWorker
var NewDeviceTracker = workers.NewDeviceTracker
var NewMetricsHistory = workers.NewMetricsHistory
var GetMetricsHandler = workers.GetMetricsHandler
