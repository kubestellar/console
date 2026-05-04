package agent

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"strings"
	"testing"
)

func TestValidateHelmK8sName(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		field   string
		wantErr bool
	}{
		{"empty name is valid", "", "release", false},
		{"valid standard name", "my-release-123", "release", false},
		{"valid complex name", "nginx.ingress_1", "namespace", false},
		{"starts with dash", "-my-release", "release", true},
		{"contains invalid character", "myrelease@123", "release", true},
		{"contains space", "my release", "release", true},
		{"contains semicolon", "release;rm", "release", true},
		{"exceeds max length", strings.Repeat("a", helmMaxK8sNameLen+1), "release", true},
		{"exactly max length", strings.Repeat("a", helmMaxK8sNameLen), "release", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateHelmK8sName(tt.input, tt.field)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateHelmK8sName() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestValidateHelmChartArg(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{"empty chart", "", true},
		{"starts with dash", "-bitnami/nginx", true},
		{"valid repo chart", "bitnami/nginx", false},
		{"valid oci format", "oci://registry-1.docker.io/bitnamicharts/nginx", false},
		{"valid complex name", "my-repo/my_chart.v1", false},
		{"contains invalid character", "bitnami/nginx&", true},
		{"contains space", "bitnami nginx", true},
		{"exactly max length", strings.Repeat("a", helmMaxChartLen), false},
		{"exceeds by one", strings.Repeat("a", helmMaxChartLen+1), true},
		{"exceeds max length", "bitnami/" + strings.Repeat("a", helmMaxChartLen), true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateHelmChartArg(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateHelmChartArg() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestValidateHelmChartVersion(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{"empty version", "", false},
		{"valid semantic version", "1.2.3", false},
		{"valid version with dash", "1.2.3-alpha.1", false},
		{"valid version with plus", "1.2.3+build.456", false},
		{"starts with dash", "-1.2.3", true},
		{"contains space", "1.2.3 alpha", true},
		{"contains invalid character", "1.2.3&alpha", true},
		{"bare label latest", "latest", false},
		{"bare label with colon", "v1:bad", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateHelmChartVersion(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateHelmChartVersion() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestServer_HandleHelmRollback(t *testing.T) {
	defer func() { execCommand = exec.Command; execCommandContext = exec.CommandContext }()
	execCommand = fakeExecCommand
	execCommandContext = fakeExecCommandContext

	server := &Server{
		allowedOrigins: []string{"*"},
		agentToken:     "test-token",
	}

	// Case 1: Success
	mockExitCode = 0
	mockStdout = "Rollback successful"
	reqBody := helmRollbackRequest{
		Release:   "my-release",
		Namespace: "my-ns",
		Cluster:   "my-cluster",
		Revision:  1,
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest("POST", "/helm/rollback", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer test-token")
	w := httptest.NewRecorder()

	server.handleHelmRollback(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d. Body: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["success"] != true {
		t.Errorf("Expected success=true, got %v", resp["success"])
	}

	// Case 2: Validation failure (missing release)
	reqBody = helmRollbackRequest{Namespace: "my-ns", Revision: 1}
	body, _ = json.Marshal(reqBody)
	req = httptest.NewRequest("POST", "/helm/rollback", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer test-token")
	w = httptest.NewRecorder()
	server.handleHelmRollback(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d", w.Code)
	}

	// Case 3: Exec failure
	mockExitCode = 1
	mockStderr = "rollback failed for some reason"
	reqBody = helmRollbackRequest{Release: "r", Namespace: "n", Revision: 1}
	body, _ = json.Marshal(reqBody)
	req = httptest.NewRequest("POST", "/helm/rollback", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer test-token")
	w = httptest.NewRecorder()
	server.handleHelmRollback(w, req)
	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected 500, got %d", w.Code)
	}
}

func TestServer_HandleHelmUninstall(t *testing.T) {
	defer func() { execCommand = exec.Command; execCommandContext = exec.CommandContext }()
	execCommand = fakeExecCommand
	execCommandContext = fakeExecCommandContext

	server := &Server{
		allowedOrigins: []string{"*"},
		agentToken:     "test-token",
	}

	// Case 1: Success
	mockExitCode = 0
	mockStdout = "Uninstalled"
	reqBody := helmUninstallRequest{
		Release:   "my-release",
		Namespace: "my-ns",
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest("POST", "/helm/uninstall", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer test-token")
	w := httptest.NewRecorder()

	server.handleHelmUninstall(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	// Case 2: Exec failure
	mockExitCode = 1
	mockStderr = "uninstall failed"
	req = httptest.NewRequest("POST", "/helm/uninstall", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer test-token")
	w = httptest.NewRecorder()
	server.handleHelmUninstall(w, req)
	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected 500, got %d", w.Code)
	}
}

func TestServer_HandleHelmUpgrade(t *testing.T) {
	defer func() { execCommand = exec.Command; execCommandContext = exec.CommandContext }()
	execCommand = fakeExecCommand
	execCommandContext = fakeExecCommandContext

	server := &Server{
		allowedOrigins: []string{"*"},
		agentToken:     "test-token",
	}

	// Case 1: Success (without values)
	mockExitCode = 0
	reqBody := helmUpgradeRequest{
		Release:   "my-release",
		Namespace: "my-ns",
		Chart:     "my-chart",
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest("POST", "/helm/upgrade", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer test-token")
	w := httptest.NewRecorder()

	server.handleHelmUpgrade(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	// Case 2: Success (with values)
	reqBody.Values = "key: value"
	body, _ = json.Marshal(reqBody)
	req = httptest.NewRequest("POST", "/helm/upgrade", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer test-token")
	w = httptest.NewRecorder()
	server.handleHelmUpgrade(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	// Case 3: Invalid chart name
	reqBody.Chart = "-invalid"
	body, _ = json.Marshal(reqBody)
	req = httptest.NewRequest("POST", "/helm/upgrade", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer test-token")
	w = httptest.NewRecorder()
	server.handleHelmUpgrade(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d", w.Code)
	}
}

func TestHandleHelmUpgrade_SecurityBoundary(t *testing.T) {
	server := &Server{
		agentToken:     "secret123",
		allowedOrigins: []string{"*"},
	}

	tests := []struct {
		name         string
		method       string
		token        string
		body         string
		expectedCode int
	}{
		{
			name:         "Missing token",
			method:       http.MethodPost,
			token:        "",
			body:         `{"release":"my-rel", "namespace":"default", "chart":"bitnami/nginx"}`,
			expectedCode: http.StatusUnauthorized,
		},
		{
			name:         "Wrong token",
			method:       http.MethodPost,
			token:        "Bearer wrong",
			body:         `{"release":"my-rel", "namespace":"default", "chart":"bitnami/nginx"}`,
			expectedCode: http.StatusUnauthorized,
		},
		{
			name:         "Invalid HTTP Method",
			method:       http.MethodGet,
			token:        "Bearer secret123",
			body:         "",
			expectedCode: http.StatusMethodNotAllowed,
		},
		{
			name:         "Invalid JSON payload",
			method:       http.MethodPost,
			token:        "Bearer secret123",
			body:         `{bad-json`,
			expectedCode: http.StatusBadRequest,
		},
		{
			name:         "Missing required fields",
			method:       http.MethodPost,
			token:        "Bearer secret123",
			body:         `{"release":"", "namespace":"", "chart":""}`,
			expectedCode: http.StatusBadRequest,
		},
		{
			name:         "Command injection in chart name",
			method:       http.MethodPost,
			token:        "Bearer secret123",
			body:         `{"release":"my-rel", "namespace":"default", "chart":"bitnami/nginx; rm -rf /"}`,
			expectedCode: http.StatusBadRequest,
		},
		{
			name:         "Command injection in namespace",
			method:       http.MethodPost,
			token:        "Bearer secret123",
			body:         `{"release":"my-rel", "namespace":"default&echo", "chart":"bitnami/nginx"}`,
			expectedCode: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, "/helm/upgrade", strings.NewReader(tt.body))
			if tt.token != "" {
				req.Header.Set("Authorization", tt.token)
			}

			w := httptest.NewRecorder()
			server.handleHelmUpgrade(w, req)

			if w.Code != tt.expectedCode {
				t.Errorf("expected status %d, got %d", tt.expectedCode, w.Code)
			}
		})
	}
}
