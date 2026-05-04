package agent

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestServer_HandlePredictionsAI(t *testing.T) {
	worker := NewPredictionWorker(nil, &Registry{}, nil, nil)
	s := &Server{
		predictionWorker: worker,
		allowedOrigins:   []string{"*"},
	}

	req := httptest.NewRequest("GET", "/predictions/ai", nil)
	w := httptest.NewRecorder()

	s.handlePredictionsAI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	var resp AIPredictionsResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}
	// Initially empty
	if len(resp.Predictions) != 0 {
		t.Errorf("Expected 0 predictions, got %d", len(resp.Predictions))
	}
}

func TestServer_HandlePredictionsFeedback(t *testing.T) {
	s := &Server{
		allowedOrigins: []string{"*"},
	}

	reqBody := PredictionFeedbackRequest{
		PredictionID: "p1",
		Feedback:     "accurate",
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest("POST", "/predictions/feedback", bytes.NewReader(body))
	w := httptest.NewRecorder()

	s.handlePredictionsFeedback(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["status"] != "recorded" {
		t.Errorf("Expected status recorded, got %s", resp["status"])
	}
}

func TestServer_HandleMetricsHistory(t *testing.T) {
	// Pass a temp directory so NewMetricsHistory doesn't default to ~/.kc and
	// call loadFromDisk() with real user data during the test.
	worker := NewMetricsHistory(nil, t.TempDir())
	s := &Server{
		metricsHistory: worker,
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/metrics/history", nil)
	w := httptest.NewRecorder()

	s.handleMetricsHistory(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}
}
