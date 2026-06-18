package providers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"k8s.io/client-go/rest"
)

// requestLog records an HTTP request method and path for test assertions.
type requestLog struct {
	Method string
	Path   string
	Body   string
}

// actionTestServer extends fakeAPIServer with support for PATCH, DELETE, POST,
// and per-resource GET (e.g., /apis/group/version/resource/name). It also
// records all requests for assertion.
type actionTestServer struct {
	// resources maps "METHOD PATH" → response object. The response is JSON-encoded.
	// Use "*" as METHOD to match any method on that path.
	resources map[string]actionResponse
	// requests records all received requests.
	requests []requestLog
	mu       sync.Mutex
	server   *httptest.Server
	cfg      *rest.Config
}

type actionResponse struct {
	statusCode int
	body       interface{}
}

// newActionTestServer creates a test server with configurable responses.
// The handlers map uses keys like "GET /apis/cluster.x-k8s.io/v1beta1/namespaces/default/machinedeployments/md1".
func newActionTestServer(t *testing.T, handlers map[string]actionResponse) *actionTestServer {
	t.Helper()
	ats := &actionTestServer{
		resources: handlers,
	}
	ats.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		bodyBytes, _ := io.ReadAll(r.Body)
		ats.mu.Lock()
		ats.requests = append(ats.requests, requestLog{
			Method: r.Method,
			Path:   r.URL.Path,
			Body:   string(bodyBytes),
		})
		ats.mu.Unlock()

		// Try exact method+path match first, then wildcard method.
		key := r.Method + " " + r.URL.Path
		resp, ok := ats.resources[key]
		if !ok {
			resp, ok = ats.resources["* "+r.URL.Path]
		}
		if ok {
			w.Header().Set("Content-Type", "application/json")
			if resp.statusCode > 0 {
				w.WriteHeader(resp.statusCode)
			}
			json.NewEncoder(w).Encode(resp.body)
			return
		}

		// Default: 404 with k8s-style Status. The message must contain
		// "not found" to match isNotFoundError's string check.
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"kind":    "Status",
			"status":  "Failure",
			"message": "resource not found",
			"reason":  "NotFound",
			"code":    404,
		})
	}))
	ats.cfg = &rest.Config{Host: ats.server.URL}
	return ats
}

func (ats *actionTestServer) Close() {
	ats.server.Close()
}

// getRequests returns a copy of logged requests.
func (ats *actionTestServer) getRequests() []requestLog {
	ats.mu.Lock()
	defer ats.mu.Unlock()
	cp := make([]requestLog, len(ats.requests))
	copy(cp, ats.requests)
	return cp
}

// hasRequest checks if a request with the given method and path substring was made.
func (ats *actionTestServer) hasRequest(method, pathSubstr string) bool {
	for _, r := range ats.getRequests() {
		if r.Method == method && strings.Contains(r.Path, pathSubstr) {
			return true
		}
	}
	return false
}

// ok200 is a convenience for creating a 200 response with a body.
func ok200(body interface{}) actionResponse {
	return actionResponse{statusCode: http.StatusOK, body: body}
}

// created201 is a convenience for creating a 201 response.
func created201(body interface{}) actionResponse {
	return actionResponse{statusCode: http.StatusCreated, body: body}
}

// conflict409 returns a 409 Conflict response.
func conflict409() actionResponse {
	return actionResponse{
		statusCode: http.StatusConflict,
		body: map[string]interface{}{
			"kind":    "Status",
			"status":  "Failure",
			"message": "the object has been modified; please apply your changes to the latest version then retry",
			"reason":  "Conflict",
			"code":    409,
		},
	}
}

// serverError500 returns a 500 Internal Server Error response.
func serverError500() actionResponse {
	return actionResponse{
		statusCode: http.StatusInternalServerError,
		body: map[string]interface{}{
			"kind":    "Status",
			"status":  "Failure",
			"message": "internal server error",
			"reason":  "InternalError",
			"code":    500,
		},
	}
}
