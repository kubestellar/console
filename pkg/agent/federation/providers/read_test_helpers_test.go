package providers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"k8s.io/client-go/rest"
)

func fakeErrorAPIServer(t *testing.T, statusCode int) (*httptest.Server, *rest.Config) {
	t.Helper()

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"kind":    "Status",
			"status":  "Failure",
			"message": http.StatusText(statusCode),
			"reason":  "InternalError",
			"code":    statusCode,
		})
	}))

	return ts, &rest.Config{Host: ts.URL}
}
