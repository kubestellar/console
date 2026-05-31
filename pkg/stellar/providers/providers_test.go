package providers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const testAPIKey = "test-api-key"

func newProviderTestServer(t *testing.T, handler http.HandlerFunc) *httptest.Server {
	t.Helper()
	return httptest.NewServer(handler)
}

func decodeJSONBody[T any](t *testing.T, r *http.Request) T {
	t.Helper()
	defer r.Body.Close()

	var payload T
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		t.Fatalf("decode request body: %v", err)
	}

	return payload
}

func collectStream(t *testing.T, stream <-chan string) string {
	t.Helper()

	var builder strings.Builder
	for token := range stream {
		builder.WriteString(token)
	}

	return builder.String()
}
