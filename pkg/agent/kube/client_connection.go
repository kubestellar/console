package kube

import (
	"encoding/base64"
	"fmt"
	"time"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd/api"
)

// TestConnectionRequest describes the fields for testing a cluster connection.
type TestConnectionRequest struct {
	ServerURL     string `json:"serverUrl"`
	AuthType      string `json:"authType"`
	Token         string `json:"token,omitempty"`
	CertData      string `json:"certData,omitempty"`
	KeyData       string `json:"keyData,omitempty"`
	CAData        string `json:"caData,omitempty"`
	SkipTLSVerify bool   `json:"skipTlsVerify,omitempty"`
}

// TestConnectionResult holds the result of a cluster connection test.
type TestConnectionResult struct {
	Reachable     bool   `json:"reachable"`
	ServerVersion string `json:"serverVersion,omitempty"`
	Error         string `json:"error,omitempty"`
}

// TestClusterConnection attempts to connect to a Kubernetes API server
// and returns basic info (version, reachable status).
func (k *KubectlProxy) TestClusterConnection(req TestConnectionRequest) (*TestConnectionResult, error) {
	if req.ServerURL == "" {
		return nil, fmt.Errorf("serverUrl is required")
	}

	cfg := &rest.Config{
		Host:    req.ServerURL,
		Timeout: 10 * time.Second,
	}

	switch req.AuthType {
	case "token":
		cfg.BearerToken = req.Token
	case "certificate":
		if req.CertData != "" {
			certBytes, err := base64.StdEncoding.DecodeString(req.CertData)
			if err != nil {
				return &TestConnectionResult{Reachable: false, Error: "invalid certData base64"}, nil
			}
			cfg.TLSClientConfig.CertData = certBytes
		}
		if req.KeyData != "" {
			keyBytes, err := base64.StdEncoding.DecodeString(req.KeyData)
			if err != nil {
				return &TestConnectionResult{Reachable: false, Error: "invalid keyData base64"}, nil
			}
			cfg.TLSClientConfig.KeyData = keyBytes
		}
	case "":
		return nil, fmt.Errorf("authType is required")
	default:
		return nil, fmt.Errorf("unsupported authType: %s (must be token or certificate)", req.AuthType)
	}

	if req.CAData != "" {
		caBytes, err := base64.StdEncoding.DecodeString(req.CAData)
		if err != nil {
			return &TestConnectionResult{Reachable: false, Error: "invalid caData base64"}, nil
		}
		cfg.TLSClientConfig.CAData = caBytes
	}
	cfg.TLSClientConfig.Insecure = req.SkipTLSVerify

	client, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return &TestConnectionResult{Reachable: false, Error: fmt.Sprintf("failed to create client: %v", err)}, nil
	}

	version, err := client.Discovery().ServerVersion()
	if err != nil {
		return &TestConnectionResult{Reachable: false, Error: fmt.Sprintf("failed to test connection: %v", err)}, nil
	}

	return &TestConnectionResult{
		Reachable:     true,
		ServerVersion: version.GitVersion,
	}, nil
}

// detectAuthMethod examines a kubeconfig AuthInfo entry and returns the auth
// method in use: "exec" (IAM/cloud CLI), "token", "certificate",
// "auth-provider", or "unknown".
func detectAuthMethod(ai *api.AuthInfo) string {
	if ai == nil {
		return "unknown"
	}
	if ai.Exec != nil {
		return "exec"
	}
	if ai.Token != "" || ai.TokenFile != "" {
		return "token"
	}
	if len(ai.ClientCertificateData) > 0 || ai.ClientCertificate != "" {
		return "certificate"
	}
	if ai.AuthProvider != nil {
		return "auth-provider"
	}
	return "unknown"
}
