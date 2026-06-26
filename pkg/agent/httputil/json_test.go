package httputil

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWriteJSON_Success(t *testing.T) {
	rec := httptest.NewRecorder()
	data := map[string]string{"hello": "world"}

	WriteJSON(rec, data)

	var got map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if got["hello"] != "world" {
		t.Errorf("expected hello=world, got %v", got)
	}
}

func TestWriteJSON_NilValue(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteJSON(rec, nil)

	body := rec.Body.String()
	if body != "null\n" {
		t.Errorf("expected null, got %q", body)
	}
}

func TestWriteJSON_Struct(t *testing.T) {
	type resp struct {
		Name  string `json:"name"`
		Count int    `json:"count"`
	}
	rec := httptest.NewRecorder()
	WriteJSON(rec, resp{Name: "test", Count: 42})

	var got resp
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if got.Name != "test" || got.Count != 42 {
		t.Errorf("unexpected result: %+v", got)
	}
}

func TestWriteJSON_SliceEmpty(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteJSON(rec, []string{})

	body := rec.Body.String()
	if body != "[]\n" {
		t.Errorf("expected empty array, got %q", body)
	}
}

func TestWriteJSON_UnencodableValue(t *testing.T) {
	// Channels cannot be JSON-encoded; WriteJSON should log error but not panic
	rec := httptest.NewRecorder()
	ch := make(chan int)
	WriteJSON(rec, ch)
	// No panic means success — the function logs the error internally
}

func TestWriteJSONError_BadRequest(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteJSONError(rec, http.StatusBadRequest, "invalid input")

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, rec.Code)
	}

	var got map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if got["error"] != "invalid input" {
		t.Errorf("expected error='invalid input', got %q", got["error"])
	}
}

func TestWriteJSONError_InternalServer(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteJSONError(rec, http.StatusInternalServerError, "something broke")

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("expected status %d, got %d", http.StatusInternalServerError, rec.Code)
	}

	var got map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if got["error"] != "something broke" {
		t.Errorf("expected error='something broke', got %q", got["error"])
	}
}

func TestWriteJSONError_NotFound(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteJSONError(rec, http.StatusNotFound, "resource not found")

	if rec.Code != http.StatusNotFound {
		t.Errorf("expected status %d, got %d", http.StatusNotFound, rec.Code)
	}

	var got map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if got["error"] != "resource not found" {
		t.Errorf("expected error='resource not found', got %q", got["error"])
	}
}

func TestWriteJSONError_Forbidden(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteJSONError(rec, http.StatusForbidden, "access denied")

	if rec.Code != http.StatusForbidden {
		t.Errorf("expected status 403, got %d", rec.Code)
	}
}

func TestWriteJSONError_EmptyMessage(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteJSONError(rec, http.StatusTeapot, "")

	if rec.Code != http.StatusTeapot {
		t.Errorf("expected status 418, got %d", rec.Code)
	}
	var got map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if got["error"] != "" {
		t.Errorf("expected empty error, got %q", got["error"])
	}
}
