package agent

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/safego"
)

const (
	predictionInitialDelay = 30 * time.Second
	predictionTimeout      = 60 * time.Second

	// perClusterDataTimeout bounds each goroutine's data-gathering work
	// (pod issues + GPU nodes + offline nodes) for a single cluster.
	perClusterDataTimeout = 15 * time.Second

	// maxPredictionConcurrency caps the number of concurrent cluster queries
	// to prevent resource exhaustion when querying many clusters.
	maxPredictionConcurrency = 10
)

// PredictionSettings holds configuration from the frontend
type PredictionSettings struct {
	AIEnabled      bool `json:"aiEnabled"`
	Interval       int  `json:"interval"`       // minutes
	MinConfidence  int  `json:"minConfidence"`  // 0-100
	MaxPredictions int  `json:"maxPredictions"` // max predictions per analysis
	ConsensusMode  bool `json:"consensusMode"`  // use multiple providers
}

// DefaultPredictionSettings returns sensible defaults
func DefaultPredictionSettings() PredictionSettings {
	return PredictionSettings{
		AIEnabled:      true,
		Interval:       10,
		MinConfidence:  60,
		MaxPredictions: 10,
		ConsensusMode:  false,
	}
}

// AIPrediction represents an AI-generated prediction
type AIPrediction struct {
	ID             string `json:"id"`
	Category       string `json:"category"`            // pod-crash, resource-trend, capacity-risk, anomaly
	Severity       string `json:"severity"`            // warning, critical
	Name           string `json:"name"`                // affected resource name
	Cluster        string `json:"cluster"`             // cluster name
	Namespace      string `json:"namespace,omitempty"` // namespace if applicable
	Reason         string `json:"reason"`              // brief summary
	ReasonDetailed string `json:"reasonDetailed"`      // full explanation
	Confidence     int    `json:"confidence"`          // 0-100
	GeneratedAt    string `json:"generatedAt"`         // ISO timestamp
	Provider       string `json:"provider"`            // AI provider name
	Trend          string `json:"trend,omitempty"`     // worsening, improving, stable
}

// AIPredictionsResponse is the HTTP response format
type AIPredictionsResponse struct {
	Predictions  []AIPrediction `json:"predictions"`
	LastAnalyzed string         `json:"lastAnalyzed"`
	Providers    []string       `json:"providers"`
	Stale        bool           `json:"stale"`
}

// AIAnalysisRequest is the request to trigger manual analysis
type AIAnalysisRequest struct {
	Providers []string `json:"providers,omitempty"` // optional: specific providers
}

// PredictionWorker runs AI analysis in the background
type PredictionWorker struct {
	k8sClient   *k8s.MultiClusterClient
	registry    *Registry
	settings    PredictionSettings
	predictions []AIPrediction
	providers   []string
	lastRun     time.Time
	running     atomic.Bool
	mu          sync.RWMutex
	stopCh      chan struct{}
	// stopOnce guards Stop() so that concurrent / repeated calls do not
	// panic on "close of closed channel" — same idempotency pattern as
	// #6478, #6586, #6623 (#6650).
	stopOnce sync.Once
	// ctx is the worker's lifecycle context; cancelled when Stop() is called.
	// All in-flight analysis goroutines derive their context from this so
	// they are cancelled promptly during graceful shutdown (#4720).
	ctx       context.Context
	ctxCancel context.CancelFunc

	// WebSocket broadcast function
	broadcast func(msgType string, payload interface{})

	// Token tracking callback
	trackTokens func(usage *ProviderTokenUsage)
	// loggedClusterError suppresses repeated "no kubeconfig" errors. This is
	// read/written from runAnalysis, which can be invoked concurrently from
	// the ticker goroutine and from on-demand Trigger() callers, so it must
	// be accessed atomically to avoid a data race.
	loggedClusterError atomic.Bool
}

// NewPredictionWorker creates a new prediction worker
func NewPredictionWorker(k8sClient *k8s.MultiClusterClient, registry *Registry, broadcast func(string, interface{}), trackTokens func(*ProviderTokenUsage)) *PredictionWorker {
	ctx, cancel := context.WithCancel(context.Background())
	return &PredictionWorker{
		k8sClient:   k8sClient,
		registry:    registry,
		settings:    DefaultPredictionSettings(),
		predictions: []AIPrediction{},
		providers:   []string{},
		stopCh:      make(chan struct{}),
		ctx:         ctx,
		ctxCancel:   cancel,
		broadcast:   broadcast,
		trackTokens: trackTokens,
	}
}

// Start begins the background analysis loop
func (w *PredictionWorker) Start() {
	safego.GoWith("prediction/run-loop", func() { w.runLoop() })
}

// Stop gracefully shuts down the worker and cancels all in-flight analyses.
// Safe to call multiple times — only the first call closes stopCh and
// cancels the lifecycle context (#6650).
func (w *PredictionWorker) Stop() {
	w.stopOnce.Do(func() {
		w.ctxCancel()
		close(w.stopCh)
	})
}

// UpdateSettings updates the worker settings
func (w *PredictionWorker) UpdateSettings(settings PredictionSettings) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.settings = settings
	slog.Info("[PredictionWorker] settings updated", "interval", settings.Interval, "minConfidence", settings.MinConfidence, "aiEnabled", settings.AIEnabled)
}

// GetSettings returns current settings
func (w *PredictionWorker) GetSettings() PredictionSettings {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.settings
}

// GetPredictions returns current predictions
func (w *PredictionWorker) GetPredictions() AIPredictionsResponse {
	w.mu.RLock()
	defer w.mu.RUnlock()

	// Check if stale (more than 2x interval since last run)
	stale := false
	if !w.lastRun.IsZero() {
		maxAge := time.Duration(w.settings.Interval*2) * time.Minute
		stale = time.Since(w.lastRun) > maxAge
	} else {
		stale = true // Never run
	}

	lastAnalyzed := ""
	if !w.lastRun.IsZero() {
		lastAnalyzed = w.lastRun.Format(time.RFC3339)
	}

	return AIPredictionsResponse{
		Predictions:  w.predictions,
		LastAnalyzed: lastAnalyzed,
		Providers:    w.providers,
		Stale:        stale,
	}
}

// TriggerAnalysis manually triggers an analysis.
//
// #6673 — Panic safety. Previously if runAnalysis panicked (parser bug,
// nil map access in a provider implementation, etc.), the `w.running = false`
// reset would not execute and IsAnalyzing() would return true forever,
// blocking all subsequent TriggerAnalysis calls until process restart.
// Callers polling TriggerAnalysis as a lightweight RPC-style surface hung
// indefinitely. Now we:
//  1. recover the panic so the process survives,
//  2. reset w.running in a defer that is guaranteed to run,
//  3. log the panic with its stack for postmortem.
//
// This is the pragmatic subset of the watchdog pattern called out in the
// issue — a full crash-detection channel for every in-flight worker RPC
// requires a larger refactor. See the doc comment on Stop() for the full
// story around graceful shutdown and ctx propagation.
func (w *PredictionWorker) TriggerAnalysis(providers []string) error {
	// Use atomic compare-and-swap to prevent concurrent runAnalysis
	// executions without an unlocked window (#7002).
	if !w.running.CompareAndSwap(false, true) {
		return fmt.Errorf("analysis already in progress")
	}

	safego.GoWith("prediction-analysis", func() {
		defer w.running.Store(false)
		w.runAnalysis(providers)
	})

	return nil
}

// IsAnalyzing returns whether analysis is currently running
func (w *PredictionWorker) IsAnalyzing() bool {
	return w.running.Load()
}

// runLoop is the main background loop.
//
// #6682 — The initial delay was a plain time.Sleep, which is uninterruptible.
// A Stop() call arriving during the first 30 seconds of process startup used
// to block graceful shutdown for the full predictionInitialDelay. Now we wait
// on a time.After channel vs. ctx.Done so Stop() cancels promptly.
//
// #6685 — The interval wait previously used `time.After(interval)` inside
// the for-loop. time.After allocates a fresh timer on every iteration and
// leaks the underlying goroutine + channel if the select returns via a
// different case before the timer fires — benign for small intervals, but
// with PredictionSettings.Interval defaulting to 10 minutes this adds up
// under rapid stop/start or settings-change churn. We now allocate a single
// *time.Timer up front and Reset() it each iteration.
func (w *PredictionWorker) runLoop() {
	// Initial analysis after short delay. The previous implementation used
	// a bare time.Sleep(predictionInitialDelay), which blocked shutdown for
	// up to predictionInitialDelay if Stop() was called during startup —
	// the shutdown signal was invisible until the sleep returned (#6652/#6682).
	// Use a *time.Timer (not time.After) so it can be drained on early return,
	// and select on stopCh + ctx.Done so shutdown is responsive during the
	// startup delay window.
	initialTimer := time.NewTimer(predictionInitialDelay)
	select {
	case <-initialTimer.C:
	case <-w.stopCh:
		initialTimer.Stop()
		slog.Info("[PredictionWorker] Stopping before initial delay")
		return
	case <-w.ctx.Done():
		initialTimer.Stop()
		slog.Info("[PredictionWorker] Context cancelled before initial delay")
		return
	}

	// Single reusable timer for the interval wait (#6685).
	intervalTimer := time.NewTimer(0)
	if !intervalTimer.Stop() {
		<-intervalTimer.C // drain the zero-duration firing before Reset
	}
	defer intervalTimer.Stop()

	for {
		w.mu.RLock()
		settings := w.settings
		w.mu.RUnlock()

		if settings.AIEnabled {
			// Use atomic CAS to prevent concurrent runAnalysis (#7002).
			if w.running.CompareAndSwap(false, true) {
				// #6673 — recover from panics in runAnalysis so the
				// periodic loop survives a single bad run. Without this,
				// a panic in any provider parser would permanently kill
				// the worker goroutine but leave the struct pointer
				// alive, silently stopping all predictions.
				func() {
					defer func() {
						if r := recover(); r != nil {
							slog.Error("[PredictionWorker] panic in runLoop runAnalysis; recovered",
								"panic", r)
						}
					}()
					w.runAnalysis(nil)
				}()
				w.running.Store(false)
			}
		}

		// Wait for next interval or stop signal using the reused timer.
		// Guard against zero/negative interval to prevent busy-loop DoS (#9620).
		intervalMinutes := settings.Interval
		if intervalMinutes < 1 {
			intervalMinutes = 10
		}
		interval := time.Duration(intervalMinutes) * time.Minute
		intervalTimer.Reset(interval)
		select {
		case <-intervalTimer.C:
			continue
		case <-w.stopCh:
			if !intervalTimer.Stop() {
				// Drain the channel if the timer already fired to keep
				// the next potential Reset() race-free.
				select {
				case <-intervalTimer.C:
				default:
				}
			}
			slog.Info("[PredictionWorker] Stopping")
			return
		case <-w.ctx.Done():
			// Handle context cancellation during interval wait, mirroring
			// the initial-delay select (#6998).
			if !intervalTimer.Stop() {
				select {
				case <-intervalTimer.C:
				default:
				}
			}
			slog.Info("[PredictionWorker] Context cancelled during interval wait")
			return
		}
	}
}

