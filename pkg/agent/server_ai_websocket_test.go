package agent

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/kubestellar/console/pkg/agent/protocol"
	"github.com/stretchr/testify/require"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
	"github.com/kubestellar/console/pkg/agent/kube"
)

func TestServer_HandleWebSocket_Upgrade(t *testing.T) {
	s := &Server{
		allowedOrigins: []string{"*"},
		upgrader:       websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }},
		clients:        make(map[*websocket.Conn]*wsClient),
	}

	ts := httptest.NewServer(http.HandlerFunc(s.handleWebSocket))
	defer ts.Close()

	// Convert http URL to ws URL
	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http")

	dialer := websocket.Dialer{}
	conn, resp, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial failed: %v", err)
	}
	defer conn.Close()

	if resp == nil {
		t.Fatalf("WebSocket dial succeeded but response was nil")
	}
	if resp.StatusCode != http.StatusSwitchingProtocols {
		t.Errorf("Expected status 101, got %d", resp.StatusCode)
	}

	// Verify client registration — poll because the server goroutine may not
	// have reached s.clients[conn] yet when Dial returns.
	require.Eventually(t, func() bool {
		s.clientsMux.Lock()
		defer s.clientsMux.Unlock()
		return len(s.clients) == 1
	}, 2*time.Second, 10*time.Millisecond, "Expected 1 registered client")

	// Wait for cleanup on close — poll instead of a fixed sleep to avoid flakiness.
	conn.Close()
	require.Eventually(t, func() bool {
		s.clientsMux.Lock()
		defer s.clientsMux.Unlock()
		return len(s.clients) == 0
	}, 2*time.Second, 10*time.Millisecond, "Expected 0 registered clients after close")
}

func TestIsReadOnlyKubectlCommand(t *testing.T) {
	tests := []struct {
		name string
		args []string
		want bool
	}{
		{name: "get is read only", args: []string{"get", "pods"}, want: true},
		{name: "bare cluster info is read only", args: []string{"cluster-info"}, want: true},
		{name: "cluster info dump is not read only", args: []string{"cluster-info", "dump"}, want: false},
		{name: "cluster info skips valued flags", args: []string{"cluster-info", "-n", "default"}, want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			args := append([]string(nil), tt.args...)
			if got := isReadOnlyKubectlCommand(args); got != tt.want {
				t.Fatalf("isReadOnlyKubectlCommand(%v) = %v, want %v", tt.args, got, tt.want)
			}
			if !reflect.DeepEqual(args, tt.args) {
				t.Fatalf("isReadOnlyKubectlCommand mutated args: got %v want %v", args, tt.args)
			}
		})
	}
}

func TestIsDestructiveKubectlCommand(t *testing.T) {
	tests := []struct {
		name string
		args []string
		want bool
	}{
		// Empty / defensive cases
		{name: "empty args is not destructive", args: nil, want: false},
		{name: "empty slice is not destructive", args: []string{}, want: false},

		// Every destructive verb in the map
		{name: "delete verb", args: []string{"delete", "pod", "foo"}, want: true},
		{name: "drain verb", args: []string{"drain", "node-1"}, want: true},
		{name: "cordon verb", args: []string{"cordon", "node-1"}, want: true},
		{name: "taint verb", args: []string{"taint", "nodes", "node-1", "key=v:NoSchedule"}, want: true},

		// Case insensitivity
		{name: "DELETE uppercase", args: []string{"DELETE", "pod", "foo"}, want: true},
		{name: "Drain mixed case", args: []string{"Drain", "node-1"}, want: true},

		// Read/inspect verbs must not be considered destructive
		{name: "get is not destructive", args: []string{"get", "pods"}, want: false},
		{name: "describe is not destructive", args: []string{"describe", "pod", "foo"}, want: false},
		{name: "logs is not destructive", args: []string{"logs", "pod/foo"}, want: false},
		{name: "apply is not on the destructive list", args: []string{"apply", "-f", "x.yaml"}, want: false},
		{name: "create is not on the destructive list", args: []string{"create", "-f", "x.yaml"}, want: false},

		// replace: plain replace IS destructive (verb is in map).
		{name: "plain replace is destructive", args: []string{"replace", "-f", "x.yaml"}, want: true},
		{name: "replace with --force is destructive", args: []string{"replace", "--force", "-f", "x.yaml"}, want: true},
		{name: "replace with --force after other flags", args: []string{"replace", "-f", "x.yaml", "--force"}, want: true},

		// --force on a non-replace verb should NOT flip a non-destructive verb.
		{name: "get with --force is not destructive", args: []string{"get", "--force", "pods"}, want: false},
		{name: "apply with --force is not on the destructive list", args: []string{"apply", "--force", "-f", "x.yaml"}, want: false},

		// Flag injection: leading "--" must not be treated as a verb match.
		{name: "leading --delete flag is not a verb match", args: []string{"--delete", "pods"}, want: false},

		// Substring of a destructive verb should not match.
		{name: "prefix of delete is not destructive", args: []string{"del", "pod"}, want: false},
		{name: "deleted is not the delete verb", args: []string{"deleted"}, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Copy args so we can detect accidental mutation.
			args := append([]string(nil), tt.args...)
			if got := isDestructiveKubectlCommand(args); got != tt.want {
				t.Fatalf("isDestructiveKubectlCommand(%v) = %v, want %v", tt.args, got, tt.want)
			}
			// Verify no mutation. Both nil and empty inputs are treated equivalently.
			if len(args) != len(tt.args) {
				t.Fatalf("isDestructiveKubectlCommand mutated args len: got %v want %v", args, tt.args)
			}
			for i := range args {
				if args[i] != tt.args[i] {
					t.Fatalf("isDestructiveKubectlCommand mutated args[%d]: got %q want %q", i, args[i], tt.args[i])
				}
			}
		})
	}
}

func TestIsDestructiveKubectlCommand_DisjointFromReadOnly(t *testing.T) {
	// Sanity: no verb should be classified as BOTH read-only and destructive.
	// If a future change adds a verb to one map without removing it from the
	// other, this test will catch it.
	for verb := range destructiveKubectlVerbs {
		if readOnlyKubectlVerbs[verb] {
			t.Errorf("verb %q appears in both destructiveKubectlVerbs and readOnlyKubectlVerbs", verb)
		}
	}
}

func TestServer_HandleWebSocket_TokenRequired(t *testing.T) {
	s := &Server{
		agentToken:     "secret",
		allowedOrigins: []string{"*"},
		upgrader:       websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }},
		clients:        make(map[*websocket.Conn]*wsClient),
	}

	ts := httptest.NewServer(http.HandlerFunc(s.handleWebSocket))
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http")

	// Case 1: No token
	dialer := websocket.Dialer{}
	_, resp, err := dialer.Dial(wsURL, nil)
	if err == nil {
		t.Fatal("Expected dial to fail without token")
	}
	if resp == nil {
		t.Fatalf("WebSocket dial failed with error: %v (response was nil)", err)
	}
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("Expected 401 Unauthorized, got %d", resp.StatusCode)
	}

	// Case 2: Valid token in query
	wsURLWithToken := wsURL + "?token=secret"
	conn, resp, err := dialer.Dial(wsURLWithToken, nil)
	if err != nil {
		t.Fatalf("WebSocket dial with token failed: %v", err)
	}
	if resp == nil {
		t.Fatalf("WebSocket dial with token succeeded but response was nil")
	}
	if resp.StatusCode != http.StatusSwitchingProtocols {
		t.Errorf("Expected status 101, got %d", resp.StatusCode)
	}
	conn.Close()
}

func TestServer_HandleWebSocket_MessageRouting(t *testing.T) {
	mockProxy := kube.NewTestKubectlProxy(&clientcmdapi.Config{
		Contexts: map[string]*clientcmdapi.Context{"c1": {Cluster: "c1"}},
	})
	s := &Server{
		allowedOrigins: []string{"*"},
		upgrader:       websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }},
		clients:        make(map[*websocket.Conn]*wsClient),
		kubectl:        mockProxy,
	}

	ts := httptest.NewServer(http.HandlerFunc(s.handleWebSocket))
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http")
	dialer := websocket.Dialer{}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Dial failed: %v", err)
	}
	defer conn.Close()

	// 1. Test Health Message
	healthMsg := protocol.Message{
		ID:   "h1",
		Type: protocol.TypeHealth,
	}
	if err := conn.WriteJSON(healthMsg); err != nil {
		t.Fatalf("WriteJSON failed: %v", err)
	}

	var resp protocol.Message
	if err := conn.ReadJSON(&resp); err != nil {
		t.Fatalf("ReadJSON failed: %v", err)
	}

	if resp.ID != "h1" || resp.Type != protocol.TypeResult {
		t.Errorf("Unexpected response: %+v", resp)
	}

	// 2. Test Clusters Message
	clustersMsg := protocol.Message{
		ID:   "c1",
		Type: protocol.TypeClusters,
	}
	if err := conn.WriteJSON(clustersMsg); err != nil {
		t.Fatalf("WriteJSON failed: %v", err)
	}

	if err := conn.ReadJSON(&resp); err != nil {
		t.Fatalf("ReadJSON failed: %v", err)
	}

	if resp.ID != "c1" || resp.Type != protocol.TypeResult {
		t.Errorf("Unexpected response: %+v", resp)
	}
}
