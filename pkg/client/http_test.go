package client

import (
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestSharedClientsConfiguration(t *testing.T) {
	tests := []struct {
		name    string
		client  *http.Client
		timeout time.Duration
	}{
		{name: "github client", client: GitHub, timeout: 15 * time.Second},
		{name: "external client", client: External, timeout: 30 * time.Second},
		{name: "short client", client: Short, timeout: 10 * time.Second},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			if tt.client.Timeout != tt.timeout {
				t.Fatalf("expected timeout %v, got %v", tt.timeout, tt.client.Timeout)
			}
			if tt.client.Transport != sharedTransport {
				t.Fatalf("expected shared transport")
			}
		})
	}
}

func TestSharedClientsCanReachHTTPServer(t *testing.T) {
	testServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer testServer.Close()

	tests := []struct {
		name   string
		client *http.Client
	}{
		{name: "github client", client: GitHub},
		{name: "external client", client: External},
		{name: "short client", client: Short},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			resp, err := tt.client.Get(testServer.URL)
			if err != nil {
				t.Fatalf("request failed: %v", err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				t.Fatalf("expected status 200, got %d", resp.StatusCode)
			}

			body, err := io.ReadAll(resp.Body)
			if err != nil {
				t.Fatalf("failed to read body: %v", err)
			}
			if string(body) != "ok" {
				t.Fatalf("expected body 'ok', got %q", string(body))
			}
		})
	}
}

func TestHTTPClientTimeoutBehavior(t *testing.T) {
	const (
		clientTimeout = 20 * time.Millisecond
		sleepDuration = 200 * time.Millisecond
		maxElapsed    = 1 * time.Second
	)

	testServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(sleepDuration)
		w.WriteHeader(http.StatusOK)
	}))
	defer testServer.Close()

	testClient := &http.Client{
		Timeout:   clientTimeout,
		Transport: sharedTransport,
	}

	start := time.Now()
	_, err := testClient.Get(testServer.URL)
	elapsed := time.Since(start)

	if err == nil {
		t.Fatal("expected timeout error, got nil")
	}

	var netErr net.Error
	if !errors.As(err, &netErr) || !netErr.Timeout() {
		t.Fatalf("expected timeout error, got: %v", err)
	}

	if elapsed > maxElapsed {
		t.Fatalf("expected timeout quickly, elapsed=%v", elapsed)
	}
}
