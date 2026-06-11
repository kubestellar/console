package agent

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"k8s.io/client-go/rest"
)

// dcgmFixtureMultiNamespace is a DCGM exporter text-format payload for
// verifying the shim delegates correctly to pkg/dcgm.
const dcgmFixtureMultiNamespace = `# HELP DCGM_FI_DEV_FB_USED Framebuffer memory used (in MiB).
# TYPE DCGM_FI_DEV_FB_USED gauge
DCGM_FI_DEV_FB_USED{gpu="0",UUID="GPU-abc",Hostname="node-1",namespace="ml-team",pod="trainer-0",container="worker"} 40960
# HELP DCGM_FI_DEV_FB_FREE Framebuffer memory free (in MiB).
# TYPE DCGM_FI_DEV_FB_FREE gauge
DCGM_FI_DEV_FB_FREE{gpu="0",UUID="GPU-abc",Hostname="node-1",namespace="ml-team",pod="trainer-0",container="worker"} 40960
`

// TestScrapeDCGMByNamespace_ShimDelegates verifies that the shim wrapper
// correctly delegates to the dcgm package implementation.
func TestScrapeDCGMByNamespace_ShimDelegates(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")
		_, _ = w.Write([]byte(dcgmFixtureMultiNamespace))
	}))
	defer srv.Close()

	cfg := &rest.Config{Host: srv.URL}
	got, err := ScrapeDCGMByNamespace(context.Background(), cfg, DCGMScrapeConfig{
		Namespace: "gpu-operator",
		Service:   "dcgm-exporter",
	})
	if err != nil {
		t.Fatalf("ScrapeDCGMByNamespace shim: %v", err)
	}
	if _, ok := got["ml-team"]; !ok {
		t.Error("expected ml-team namespace in result from shim")
	}
}
