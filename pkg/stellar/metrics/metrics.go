package metrics

type noopMetric struct{}

func newHistogram(_ string) *noopMetric { return &noopMetric{} }
func newCounter(_ string) *noopMetric   { return &noopMetric{} }

var (
	AskDurationMs    = newHistogram("stellar_ask_duration_ms")
	AskTokensUsed    = newCounter("stellar_ask_tokens_total")
	WatcherPollCount = newCounter("stellar_watcher_polls_total")
	NotifCreated     = newCounter("stellar_notifications_created_total")
	ActionExecuted   = newCounter("stellar_actions_executed_total")
	ActionFailed     = newCounter("stellar_actions_failed_total")
)
