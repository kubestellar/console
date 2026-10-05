package updater

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus/testutil"
)

func TestInitUpdaterMetrics_SafeToCallMultipleTimes(t *testing.T) {
	// Registering the same collector twice with the default registry would
	// panic; InitUpdaterMetrics must guard with sync.Once so repeated
	// construction of UpdateChecker (e.g. via NewUpdateChecker in tests)
	// never crashes the process.
	InitUpdaterMetrics()
	InitUpdaterMetrics()
}

func TestRecordUpdateCheckCycle_IncrementsCounterAndHistogram(t *testing.T) {
	InitUpdaterMetrics()

	before := testutil.ToFloat64(updateCheckCyclesTotal.WithLabelValues("developer"))
	recordUpdateCheckCycle("developer", 2*time.Second)
	after := testutil.ToFloat64(updateCheckCyclesTotal.WithLabelValues("developer"))

	if after != before+1 {
		t.Errorf("expected cycle counter to increment by 1, got %v -> %v", before, after)
	}
}

func TestRecordUpdateCheckError_IncrementsByStage(t *testing.T) {
	InitUpdaterMetrics()

	before := testutil.ToFloat64(updateCheckErrorsTotal.WithLabelValues("fetch_main_sha"))
	recordUpdateCheckError("fetch_main_sha")
	after := testutil.ToFloat64(updateCheckErrorsTotal.WithLabelValues("fetch_main_sha"))

	if after != before+1 {
		t.Errorf("expected error counter for stage to increment by 1, got %v -> %v", before, after)
	}
}

func TestCheckDeveloperChannel_FetchMainSHAFailure_RecordsError(t *testing.T) {
	InitUpdaterMetrics()

	origFetch := fetchLatestMainSHAFn
	defer func() { fetchLatestMainSHAFn = origFetch }()
	fetchLatestMainSHAFn = func(string) (string, error) {
		return "", http.ErrServerClosed
	}

	before := testutil.ToFloat64(updateCheckErrorsTotal.WithLabelValues("fetch_main_sha"))

	uc := &UpdateChecker{
		channel:   "developer",
		repoPath:  "/tmp/fake-repo",
		broadcast: func(string, interface{}) {},
	}
	uc.checkDeveloperChannel()

	after := testutil.ToFloat64(updateCheckErrorsTotal.WithLabelValues("fetch_main_sha"))
	if after != before+1 {
		t.Errorf("expected fetch_main_sha error to be recorded, got %v -> %v", before, after)
	}
}

func TestCheckReleaseChannel_FetchReleasesFailure_RecordsError(t *testing.T) {
	InitUpdaterMetrics()

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer ts.Close()
	swapClientAndReleasesURL(t, ts)

	before := testutil.ToFloat64(updateCheckErrorsTotal.WithLabelValues("fetch_releases"))

	uc := &UpdateChecker{
		channel:       "stable",
		installMethod: "binary",
		broadcast:     func(string, interface{}) {},
	}
	uc.checkReleaseChannel("stable")

	after := testutil.ToFloat64(updateCheckErrorsTotal.WithLabelValues("fetch_releases"))
	if after != before+1 {
		t.Errorf("expected fetch_releases error to be recorded, got %v -> %v", before, after)
	}
}
