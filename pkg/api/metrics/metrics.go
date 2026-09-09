// Package metrics provides bounded self-observability metrics for the
// console backend, exposed via Prometheus' client_golang (already a direct
// dependency, used elsewhere to scrape external clusters — see
// pkg/gpu/scraper.go). No exporter or external data flow is added: metrics
// are only ever pulled by an operator-controlled Prometheus instance that
// scrapes the /metrics endpoint this package registers.
//
// In addition to the HTTP server metrics below, Init also wires client-go's
// tools/metrics hooks so every outbound Kubernetes API call (across all
// clusters managed via pkg/k8s) is counted and timed automatically, with no
// changes needed at individual call sites (see issue #23055).
package metrics

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/adaptor"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	clientgometrics "k8s.io/client-go/tools/metrics"
)

var (
	httpRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "console_http_requests_total",
			Help: "Total number of HTTP requests handled by the console backend.",
		},
		// route is the registered Fiber route pattern (e.g. "/api/clusters/:name"),
		// never the raw request path, so cardinality stays bounded to the
		// fixed set of routes the server registers.
		[]string{"method", "route", "status"},
	)

	httpRequestDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "console_http_request_duration_seconds",
			Help:    "HTTP request latency for the console backend, in seconds.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "route"},
	)

	// stellarStaleApprovalSweepCyclesTotal counts completed runs of the
	// stale-approval review loop (pkg/api/handlers/stellar/solver_workers.go),
	// which runs on an hourly ticker outside the HTTP request path and
	// therefore gets no coverage from httpRequestsTotal/httpRequestDuration.
	stellarStaleApprovalSweepCyclesTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "console_stellar_stale_approval_sweep_cycles_total",
			Help: "Total number of completed Stellar stale-approval review sweeps.",
		},
	)

	stellarStaleApprovalSweepDuration = prometheus.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "console_stellar_stale_approval_sweep_duration_seconds",
			Help:    "Duration of a full Stellar stale-approval review sweep, in seconds.",
			Buckets: prometheus.DefBuckets,
		},
	)

	stellarStaleApprovalActionsReviewedTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "console_stellar_stale_approval_actions_reviewed_total",
			Help: "Total pending approval actions reviewed by the stale-approval sweep, by outcome.",
		},
		// outcome is a fixed, bounded set ("superseded" or "bumped") — never
		// an action ID, user ID, or other unbounded value.
		[]string{"outcome"},
	)

	// stellarDailyDigestCyclesTotal counts completed runs of the daily-digest
	// check loop, which also runs on an hourly ticker outside the HTTP
	// request path.
	stellarDailyDigestCyclesTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "console_stellar_daily_digest_cycles_total",
			Help: "Total number of completed Stellar daily-digest check cycles.",
		},
	)

	stellarDailyDigestSentTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "console_stellar_daily_digest_sent_total",
			Help: "Total number of Stellar daily-digest notifications actually sent to users.",
		},
	)

	// stellarSchedulerDispatchCyclesTotal counts completed runs of the
	// Stellar action scheduler's 30s poll loop (pkg/stellar/scheduler/scheduler.go),
	// which fetches due approved actions and dispatches them against live
	// clusters outside the HTTP request path.
	stellarSchedulerDispatchCyclesTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "console_stellar_scheduler_dispatch_cycles_total",
			Help: "Total number of completed Stellar action-scheduler poll cycles (due-actions fetch succeeded).",
		},
	)

	stellarSchedulerActionsPickedUpTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "console_stellar_scheduler_actions_picked_up_total",
			Help: "Total number of due Stellar actions picked up for dispatch by the scheduler.",
		},
	)

	stellarActionExecutionDuration = prometheus.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "console_stellar_action_execution_duration_seconds",
			Help:    "Wall-clock duration of a single Stellar scheduled-action execution, in seconds.",
			Buckets: prometheus.DefBuckets,
		},
	)

	stellarActionOutcomesTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "console_stellar_action_outcomes_total",
			Help: "Total Stellar scheduled-action executions, by outcome.",
		},
		// outcome is a fixed, bounded set (completed, failed, retry,
		// idempotent_skip) — never an action ID, user ID, or other
		// unbounded value.
		[]string{"outcome"},
	)

	// gpuUtilScrapeCyclesTotal counts completed runs of the GPU utilization
	// worker's poll loop (pkg/api/gpu_utilization_worker.go), which runs on
	// its own ticker outside the HTTP request path and therefore gets no
	// coverage from httpRequestsTotal/httpRequestDuration.
	gpuUtilScrapeCyclesTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "console_gpu_util_scrape_cycles_total",
			Help: "Total number of completed GPU utilization worker poll cycles.",
		},
	)

	gpuUtilScrapeDuration = prometheus.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "console_gpu_util_scrape_duration_seconds",
			Help:    "Duration of a full GPU utilization worker poll cycle, in seconds.",
			Buckets: prometheus.DefBuckets,
		},
	)

	gpuUtilReservationCollectTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "console_gpu_util_reservation_collect_total",
			Help: "Total per-reservation GPU utilization collection attempts, by outcome.",
		},
		// outcome is a fixed, bounded set (success, pods_error, nodes_error,
		// snapshot_error) — never a reservation ID, cluster name, or other
		// unbounded value.
		[]string{"outcome"},
	)

	gpuUtilDCGMScrapeErrorsTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "console_gpu_util_dcgm_scrape_errors_total",
			Help: "Total number of failed DCGM exporter scrapes by the GPU utilization worker (opt-in feature).",
		},
	)

	gpuUtilAlertSendErrorsTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "console_gpu_util_alert_send_errors_total",
			Help: "Total number of failed GPU utilization threshold alert deliveries.",
		},
	)

	// k8sClientRequestsTotal and k8sClientRequestDuration instrument every
	// outbound Kubernetes API call made by client-go across all configured
	// clusters (see pkg/k8s), via client-go's own tools/metrics adapter
	// hooks — no call sites need to change. host is the API server host:port
	// (one bounded value per configured cluster), never a resource path, so
	// cardinality stays bounded regardless of how many objects are queried.
	k8sClientRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "console_k8s_client_requests_total",
			Help: "Total number of Kubernetes API requests made by the console backend, across all configured clusters.",
		},
		[]string{"code", "method", "host"},
	)

	k8sClientRequestDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "console_k8s_client_request_duration_seconds",
			Help:    "Kubernetes API request latency for the console backend, in seconds, across all configured clusters.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"verb", "host"},
	)

	// notificationSendsTotal counts alert-delivery attempts made by
	// pkg/notifications (Slack/Email/PagerDuty/OpsGenie/webhook), which is
	// invoked outside the HTTP request path and previously had zero
	// observability — a broken alert channel failed silently except in logs.
	notificationSendsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "console_notification_sends_total",
			Help: "Total alert-notification delivery attempts by channel type and outcome.",
		},
		// channel_type is the fixed, bounded NotificationType enum
		// (slack, email, webhook, pagerduty, opsgenie) — never a
		// user-supplied notifier ID. outcome is "sent" or "failed".
		[]string{"channel_type", "outcome"},
	)

	notificationSendDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "console_notification_send_duration_seconds",
			Help:    "Duration of a single alert-notification delivery attempt, in seconds, by channel type.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"channel_type"},
	)

	initOnce sync.Once
)

// Init registers the metrics collectors and the client-go instrumentation
// hooks. Safe to call multiple times; must be called before the first
// Kubernetes API request is made (client-go reads these hooks lazily per
// request, so registering any time before that point — e.g. before
// k8s.NewMultiClusterClient is called — is sufficient).
func Init() {
	initOnce.Do(func() {
		prometheus.MustRegister(httpRequestsTotal)
		prometheus.MustRegister(httpRequestDuration)
		prometheus.MustRegister(stellarStaleApprovalSweepCyclesTotal)
		prometheus.MustRegister(stellarStaleApprovalSweepDuration)
		prometheus.MustRegister(stellarStaleApprovalActionsReviewedTotal)
		prometheus.MustRegister(stellarDailyDigestCyclesTotal)
		prometheus.MustRegister(stellarDailyDigestSentTotal)
		prometheus.MustRegister(stellarSchedulerDispatchCyclesTotal)
		prometheus.MustRegister(stellarSchedulerActionsPickedUpTotal)
		prometheus.MustRegister(stellarActionExecutionDuration)
		prometheus.MustRegister(stellarActionOutcomesTotal)
		prometheus.MustRegister(gpuUtilScrapeCyclesTotal)
		prometheus.MustRegister(gpuUtilScrapeDuration)
		prometheus.MustRegister(gpuUtilReservationCollectTotal)
		prometheus.MustRegister(gpuUtilDCGMScrapeErrorsTotal)
		prometheus.MustRegister(gpuUtilAlertSendErrorsTotal)
		prometheus.MustRegister(k8sClientRequestsTotal)
		prometheus.MustRegister(k8sClientRequestDuration)

		clientgometrics.Register(clientgometrics.RegisterOpts{
			RequestResult:  resultAdapter{counter: k8sClientRequestsTotal},
			RequestLatency: latencyAdapter{histogram: k8sClientRequestDuration},
		})
		prometheus.MustRegister(notificationSendsTotal)
		prometheus.MustRegister(notificationSendDuration)
	})
}

// resultAdapter bridges client-go's ResultMetric interface to the bounded
// console_k8s_client_requests_total counter.
type resultAdapter struct {
	counter *prometheus.CounterVec
}

func (r resultAdapter) Increment(_ context.Context, code, method, host string) {
	r.counter.WithLabelValues(code, method, host).Inc()
}

// latencyAdapter bridges client-go's LatencyMetric interface to the bounded
// console_k8s_client_request_duration_seconds histogram. Only verb and host
// are used as labels — u.Path is intentionally dropped, since it contains
// unbounded resource names/namespaces (matching the approach used by
// k8s.io/component-base/metrics/prometheus/clientgo).
type latencyAdapter struct {
	histogram *prometheus.HistogramVec
}

func (l latencyAdapter) Observe(_ context.Context, verb string, u url.URL, latency time.Duration) {
	l.histogram.WithLabelValues(verb, u.Host).Observe(latency.Seconds())
}

// unmatchedRoute is the bounded label value used when Fiber has no matching
// route for a request (e.g. 404s), so unknown/attacker-supplied paths never
// create new label series.
const unmatchedRoute = "unmatched"

// Middleware returns a Fiber handler that records request count and
// duration, keyed by method, registered route pattern, and status code —
// all bounded label sets.
func Middleware() fiber.Handler {
	Init()
	return func(c *fiber.Ctx) error {
		start := time.Now()
		err := c.Next()

		route := unmatchedRoute
		if r := c.Route(); r != nil && r.Path != "" {
			route = r.Path
		}
		method := c.Method()
		status := c.Response().StatusCode()
		if err != nil {
			if fe, ok := err.(*fiber.Error); ok {
				status = fe.Code
			} else if status < http.StatusInternalServerError {
				status = http.StatusInternalServerError
			}
		}

		httpRequestsTotal.WithLabelValues(method, route, strconv.Itoa(status)).Inc()
		httpRequestDuration.WithLabelValues(method, route).Observe(time.Since(start).Seconds())

		return err
	}
}

// Handler adapts the Prometheus HTTP handler for use as a Fiber route.
func Handler() fiber.Handler {
	Init()
	return adaptor.HTTPHandler(promhttp.Handler())
}

// Stale-approval review outcomes for RecordStellarStaleApprovalActionsReviewed.
// This is the complete, fixed set of values the "outcome" label may take —
// never an action ID, user ID, or other unbounded value.
const (
	StellarApprovalOutcomeSuperseded = "superseded"
	StellarApprovalOutcomeBumped     = "bumped"
)

// RecordStellarStaleApprovalSweep records one completed stale-approval
// review sweep and its wall-clock duration.
func RecordStellarStaleApprovalSweep(duration time.Duration) {
	Init()
	stellarStaleApprovalSweepCyclesTotal.Inc()
	stellarStaleApprovalSweepDuration.Observe(duration.Seconds())
}

// RecordStellarStaleApprovalActionsReviewed records reviewed pending
// approval actions from a single sweep. outcome must be one of the
// StellarApprovalOutcome* constants above. count may be zero (no-op).
func RecordStellarStaleApprovalActionsReviewed(outcome string, count int) {
	if count <= 0 {
		return
	}
	Init()
	stellarStaleApprovalActionsReviewedTotal.WithLabelValues(outcome).Add(float64(count))
}

// RecordStellarDailyDigestCycle records one completed daily-digest check
// cycle (regardless of whether any digest was actually sent).
func RecordStellarDailyDigestCycle() {
	Init()
	stellarDailyDigestCyclesTotal.Inc()
}

// RecordStellarDailyDigestSent records one daily-digest notification
// actually sent to a user.
func RecordStellarDailyDigestSent() {
	Init()
	stellarDailyDigestSentTotal.Inc()
}

// Scheduled-action outcomes for RecordStellarActionOutcome. This is the
// complete, fixed set of values the "outcome" label may take — never an
// action ID, user ID, or other unbounded value.
const (
	StellarActionOutcomeCompleted      = "completed"
	StellarActionOutcomeFailed         = "failed"
	StellarActionOutcomeRetry          = "retry"
	StellarActionOutcomeIdempotentSkip = "idempotent_skip"
)

// RecordStellarSchedulerDispatchCycle records one completed poll cycle of
// the Stellar action scheduler (due-actions fetch succeeded), along with
// how many actions it picked up for dispatch.
func RecordStellarSchedulerDispatchCycle(actionsPickedUp int) {
	Init()
	stellarSchedulerDispatchCyclesTotal.Inc()
	if actionsPickedUp > 0 {
		stellarSchedulerActionsPickedUpTotal.Add(float64(actionsPickedUp))
	}
}

// RecordStellarActionExecution records the outcome and wall-clock duration
// of a single scheduled-action execution. outcome must be one of the
// StellarActionOutcome* constants above.
func RecordStellarActionExecution(outcome string, duration time.Duration) {
	Init()
	stellarActionOutcomesTotal.WithLabelValues(outcome).Inc()
	stellarActionExecutionDuration.Observe(duration.Seconds())
}

// Per-reservation GPU utilization collection outcomes for
// RecordGPUUtilReservationCollect. This is the complete, fixed set of
// values the "outcome" label may take — never a reservation ID, cluster
// name, or other unbounded value.
const (
	GPUUtilReservationOutcomeSuccess       = "success"
	GPUUtilReservationOutcomePodsError     = "pods_error"
	GPUUtilReservationOutcomeNodesError    = "nodes_error"
	GPUUtilReservationOutcomeSnapshotError = "snapshot_error"
)

// RecordGPUUtilScrapeCycle records one completed GPU utilization worker
// poll cycle and its wall-clock duration.
func RecordGPUUtilScrapeCycle(duration time.Duration) {
	Init()
	gpuUtilScrapeCyclesTotal.Inc()
	gpuUtilScrapeDuration.Observe(duration.Seconds())
}

// RecordGPUUtilReservationCollect records one per-reservation utilization
// collection attempt. outcome must be one of the GPUUtilReservationOutcome*
// constants above.
func RecordGPUUtilReservationCollect(outcome string) {
	Init()
	gpuUtilReservationCollectTotal.WithLabelValues(outcome).Inc()
}

// RecordGPUUtilDCGMScrapeError records one failed DCGM exporter scrape by
// the GPU utilization worker (opt-in feature).
func RecordGPUUtilDCGMScrapeError() {
	Init()
	gpuUtilDCGMScrapeErrorsTotal.Inc()
}

// RecordGPUUtilAlertSendError records one failed GPU utilization threshold
// alert delivery.
func RecordGPUUtilAlertSendError() {
	Init()
	gpuUtilAlertSendErrorsTotal.Inc()
}

// Notification-send outcomes for RecordNotificationSend. This is the
// complete, fixed set of values the "outcome" label may take.
const (
	NotificationOutcomeSent   = "sent"
	NotificationOutcomeFailed = "failed"
)

// RecordNotificationSend records one alert-notification delivery attempt
// made by pkg/notifications. channelType must be one of the
// notifications.NotificationType values (slack, email, webhook, pagerduty,
// opsgenie) — a fixed, bounded set, never a user-supplied notifier ID.
// outcome must be one of the NotificationOutcome* constants above.
func RecordNotificationSend(channelType, outcome string, duration time.Duration) {
	Init()
	notificationSendsTotal.WithLabelValues(channelType, outcome).Inc()
	notificationSendDuration.WithLabelValues(channelType).Observe(duration.Seconds())
}
