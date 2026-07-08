package kube

import (
	"testing"

	api "k8s.io/client-go/tools/clientcmd/api"
)

func TestClustersEquivalent_BothNil(t *testing.T) {
	if !clustersEquivalent(nil, nil) {
		t.Error("expected nil == nil")
	}
}

func TestClustersEquivalent_OneNil(t *testing.T) {
	c := &api.Cluster{Server: "https://localhost"}
	if clustersEquivalent(c, nil) {
		t.Error("expected non-nil != nil")
	}
	if clustersEquivalent(nil, c) {
		t.Error("expected nil != non-nil")
	}
}

func TestClustersEquivalent_SameCluster(t *testing.T) {
	a := &api.Cluster{Server: "https://k8s.example.com:6443"}
	b := &api.Cluster{Server: "https://k8s.example.com:6443"}
	if !clustersEquivalent(a, b) {
		t.Error("expected identical clusters to be equivalent")
	}
}

func TestClustersEquivalent_DifferentServer(t *testing.T) {
	a := &api.Cluster{Server: "https://k8s-1.example.com"}
	b := &api.Cluster{Server: "https://k8s-2.example.com"}
	if clustersEquivalent(a, b) {
		t.Error("expected different servers to be non-equivalent")
	}
}

func TestClustersEquivalent_IgnoresLocationOfOrigin(t *testing.T) {
	a := &api.Cluster{Server: "https://k8s.example.com", LocationOfOrigin: "/home/user/.kube/config"}
	b := &api.Cluster{Server: "https://k8s.example.com", LocationOfOrigin: "/other/path/config"}
	if !clustersEquivalent(a, b) {
		t.Error("expected clusters with different LocationOfOrigin to be equivalent")
	}
}

func TestClustersEquivalent_DifferentTLS(t *testing.T) {
	a := &api.Cluster{Server: "https://k8s.example.com", InsecureSkipTLSVerify: false}
	b := &api.Cluster{Server: "https://k8s.example.com", InsecureSkipTLSVerify: true}
	if clustersEquivalent(a, b) {
		t.Error("expected clusters with different TLS settings to be non-equivalent")
	}
}

func TestAuthInfosEquivalent_BothNil(t *testing.T) {
	if !authInfosEquivalent(nil, nil) {
		t.Error("expected nil == nil")
	}
}

func TestAuthInfosEquivalent_OneNil(t *testing.T) {
	a := &api.AuthInfo{Token: "tok123"}
	if authInfosEquivalent(a, nil) {
		t.Error("expected non-nil != nil")
	}
	if authInfosEquivalent(nil, a) {
		t.Error("expected nil != non-nil")
	}
}

func TestAuthInfosEquivalent_SameAuth(t *testing.T) {
	a := &api.AuthInfo{Token: "tok123"}
	b := &api.AuthInfo{Token: "tok123"}
	if !authInfosEquivalent(a, b) {
		t.Error("expected identical auth infos to be equivalent")
	}
}

func TestAuthInfosEquivalent_DifferentToken(t *testing.T) {
	a := &api.AuthInfo{Token: "tok123"}
	b := &api.AuthInfo{Token: "tok456"}
	if authInfosEquivalent(a, b) {
		t.Error("expected different tokens to be non-equivalent")
	}
}

func TestAuthInfosEquivalent_IgnoresLocationOfOrigin(t *testing.T) {
	a := &api.AuthInfo{Token: "tok123", LocationOfOrigin: "/path/a"}
	b := &api.AuthInfo{Token: "tok123", LocationOfOrigin: "/path/b"}
	if !authInfosEquivalent(a, b) {
		t.Error("expected auth infos with different LocationOfOrigin to be equivalent")
	}
}

func TestAuthInfosEquivalent_DifferentCert(t *testing.T) {
	a := &api.AuthInfo{ClientCertificateData: []byte("cert-a")}
	b := &api.AuthInfo{ClientCertificateData: []byte("cert-b")}
	if authInfosEquivalent(a, b) {
		t.Error("expected different client certs to be non-equivalent")
	}
}
