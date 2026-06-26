package v1alpha1

import (
	"encoding/json"
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/runtime/schema"
)

func TestMCSGVRs(t *testing.T) {
	tests := []struct {
		name     string
		gvr      schema.GroupVersionResource
		expGroup string
		expVer   string
		expRes   string
	}{
		{
			name:     "ServiceExportGVR",
			gvr:      ServiceExportGVR,
			expGroup: "multicluster.x-k8s.io",
			expVer:   "v1alpha1",
			expRes:   "serviceexports",
		},
		{
			name:     "ServiceImportGVR",
			gvr:      ServiceImportGVR,
			expGroup: "multicluster.x-k8s.io",
			expVer:   "v1alpha1",
			expRes:   "serviceimports",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if tc.gvr.Group != tc.expGroup {
				t.Errorf("Group = %q, want %q", tc.gvr.Group, tc.expGroup)
			}
			if tc.gvr.Version != tc.expVer {
				t.Errorf("Version = %q, want %q", tc.gvr.Version, tc.expVer)
			}
			if tc.gvr.Resource != tc.expRes {
				t.Errorf("Resource = %q, want %q", tc.gvr.Resource, tc.expRes)
			}
		})
	}
}

func TestServiceExportStatusConstants(t *testing.T) {
	tests := []struct {
		name   string
		status ServiceExportStatus
		want   string
	}{
		{"Ready", ServiceExportStatusReady, "Ready"},
		{"Pending", ServiceExportStatusPending, "Pending"},
		{"Failed", ServiceExportStatusFailed, "Failed"},
		{"Unknown", ServiceExportStatusUnknown, "Unknown"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if string(tc.status) != tc.want {
				t.Errorf("status = %q, want %q", tc.status, tc.want)
			}
		})
	}
}

func TestServiceImportTypeConstants(t *testing.T) {
	tests := []struct {
		name string
		typ  ServiceImportType
		want string
	}{
		{"ClusterSetIP", ServiceImportTypeClusterSetIP, "ClusterSetIP"},
		{"Headless", ServiceImportTypeHeadless, "Headless"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if string(tc.typ) != tc.want {
				t.Errorf("type = %q, want %q", tc.typ, tc.want)
			}
		})
	}
}

func TestServiceExportJSONRoundTrip(t *testing.T) {
	now := time.Now().Truncate(time.Second)
	original := ServiceExport{
		Name:           "test-export",
		Namespace:      "default",
		Cluster:        "cluster-1",
		ServiceName:    "api-service",
		Status:         ServiceExportStatusReady,
		Message:        "Service exported successfully",
		TargetClusters: []string{"cluster-2", "cluster-3"},
		CreatedAt:      now,
		Conditions: []Condition{
			{
				Type:               "Ready",
				Status:             "True",
				Reason:             "Exported",
				Message:            "Service is exported",
				LastTransitionTime: now,
			},
		},
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded ServiceExport
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Name != original.Name {
		t.Errorf("Name = %q, want %q", decoded.Name, original.Name)
	}
	if decoded.Status != original.Status {
		t.Errorf("Status = %q, want %q", decoded.Status, original.Status)
	}
	if len(decoded.TargetClusters) != len(original.TargetClusters) {
		t.Errorf("TargetClusters length = %d, want %d", len(decoded.TargetClusters), len(original.TargetClusters))
	}
	if len(decoded.Conditions) != len(original.Conditions) {
		t.Errorf("Conditions length = %d, want %d", len(decoded.Conditions), len(original.Conditions))
	}
}

func TestServiceImportJSONRoundTrip(t *testing.T) {
	now := time.Now().Truncate(time.Second)
	original := ServiceImport{
		Name:          "test-import",
		Namespace:     "default",
		Cluster:       "cluster-2",
		SourceCluster: "cluster-1",
		Type:          ServiceImportTypeClusterSetIP,
		DNSName:       "api-service.default.svc.clusterset.local",
		ClusterSetIPs: []string{"10.96.0.100", "10.96.0.101"},
		Ports: []ServicePort{
			{
				Name:        "http",
				Protocol:    "TCP",
				Port:        80,
				AppProtocol: "http",
			},
			{
				Name:     "https",
				Protocol: "TCP",
				Port:     443,
			},
		},
		Endpoints: 3,
		CreatedAt: now,
		Conditions: []Condition{
			{
				Type:   "Ready",
				Status: "True",
			},
		},
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded ServiceImport
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Name != original.Name {
		t.Errorf("Name = %q, want %q", decoded.Name, original.Name)
	}
	if decoded.Type != original.Type {
		t.Errorf("Type = %q, want %q", decoded.Type, original.Type)
	}
	if decoded.Endpoints != original.Endpoints {
		t.Errorf("Endpoints = %d, want %d", decoded.Endpoints, original.Endpoints)
	}
	if len(decoded.Ports) != len(original.Ports) {
		t.Errorf("Ports length = %d, want %d", len(decoded.Ports), len(original.Ports))
	}
	if len(decoded.ClusterSetIPs) != len(original.ClusterSetIPs) {
		t.Errorf("ClusterSetIPs length = %d, want %d", len(decoded.ClusterSetIPs), len(original.ClusterSetIPs))
	}
}

func TestServicePortJSONRoundTrip(t *testing.T) {
	original := ServicePort{
		Name:        "grpc",
		Protocol:    "TCP",
		Port:        9090,
		AppProtocol: "grpc",
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded ServicePort
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Name != original.Name {
		t.Errorf("Name = %q, want %q", decoded.Name, original.Name)
	}
	if decoded.Protocol != original.Protocol {
		t.Errorf("Protocol = %q, want %q", decoded.Protocol, original.Protocol)
	}
	if decoded.Port != original.Port {
		t.Errorf("Port = %d, want %d", decoded.Port, original.Port)
	}
	if decoded.AppProtocol != original.AppProtocol {
		t.Errorf("AppProtocol = %q, want %q", decoded.AppProtocol, original.AppProtocol)
	}
}

func TestConditionJSONRoundTrip(t *testing.T) {
	now := time.Now().Truncate(time.Second)
	original := Condition{
		Type:               "Ready",
		Status:             "True",
		Reason:             "AllChecksPass",
		Message:            "All health checks passed",
		LastTransitionTime: now,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded Condition
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Type != original.Type {
		t.Errorf("Type = %q, want %q", decoded.Type, original.Type)
	}
	if decoded.Status != original.Status {
		t.Errorf("Status = %q, want %q", decoded.Status, original.Status)
	}
	if decoded.Reason != original.Reason {
		t.Errorf("Reason = %q, want %q", decoded.Reason, original.Reason)
	}
	if decoded.Message != original.Message {
		t.Errorf("Message = %q, want %q", decoded.Message, original.Message)
	}
}

func TestMCSClusterErrorJSONRoundTrip(t *testing.T) {
	original := MCSClusterError{
		Cluster:   "cluster-3",
		ErrorType: "ApiTimeout",
		Message:   "connection timed out",
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded MCSClusterError
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Cluster != original.Cluster {
		t.Errorf("Cluster = %q, want %q", decoded.Cluster, original.Cluster)
	}
	if decoded.ErrorType != original.ErrorType {
		t.Errorf("ErrorType = %q, want %q", decoded.ErrorType, original.ErrorType)
	}
	if decoded.Message != original.Message {
		t.Errorf("Message = %q, want %q", decoded.Message, original.Message)
	}
}

func TestServiceExportListJSONRoundTrip(t *testing.T) {
	original := ServiceExportList{
		Items: []ServiceExport{
			{Name: "export-1", Namespace: "default", Status: ServiceExportStatusReady},
			{Name: "export-2", Namespace: "kube-system", Status: ServiceExportStatusPending},
		},
		TotalCount: 2,
		ClusterErrors: []MCSClusterError{
			{Cluster: "failed-cluster", ErrorType: "ApiError", Message: "failed to connect"},
		},
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded ServiceExportList
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.TotalCount != original.TotalCount {
		t.Errorf("TotalCount = %d, want %d", decoded.TotalCount, original.TotalCount)
	}
	if len(decoded.Items) != len(original.Items) {
		t.Errorf("Items length = %d, want %d", len(decoded.Items), len(original.Items))
	}
	if len(decoded.ClusterErrors) != len(original.ClusterErrors) {
		t.Errorf("ClusterErrors length = %d, want %d", len(decoded.ClusterErrors), len(original.ClusterErrors))
	}
}

func TestServiceImportListJSONRoundTrip(t *testing.T) {
	original := ServiceImportList{
		Items: []ServiceImport{
			{Name: "import-1", Namespace: "default", Type: ServiceImportTypeClusterSetIP},
			{Name: "import-2", Namespace: "default", Type: ServiceImportTypeHeadless},
		},
		TotalCount: 2,
		ClusterErrors: []MCSClusterError{
			{Cluster: "offline-cluster", ErrorType: "Offline", Message: "cluster not reachable"},
		},
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded ServiceImportList
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.TotalCount != original.TotalCount {
		t.Errorf("TotalCount = %d, want %d", decoded.TotalCount, original.TotalCount)
	}
	if len(decoded.Items) != len(original.Items) {
		t.Errorf("Items length = %d, want %d", len(decoded.Items), len(original.Items))
	}
	if len(decoded.ClusterErrors) != len(original.ClusterErrors) {
		t.Errorf("ClusterErrors length = %d, want %d", len(decoded.ClusterErrors), len(original.ClusterErrors))
	}
}

func TestClusterServiceSummaryJSONRoundTrip(t *testing.T) {
	original := ClusterServiceSummary{
		Cluster:      "cluster-1",
		ExportCount:  15,
		ImportCount:  8,
		HealthyCount: 20,
		FailedCount:  3,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded ClusterServiceSummary
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Cluster != original.Cluster {
		t.Errorf("Cluster = %q, want %q", decoded.Cluster, original.Cluster)
	}
	if decoded.ExportCount != original.ExportCount {
		t.Errorf("ExportCount = %d, want %d", decoded.ExportCount, original.ExportCount)
	}
	if decoded.ImportCount != original.ImportCount {
		t.Errorf("ImportCount = %d, want %d", decoded.ImportCount, original.ImportCount)
	}
	if decoded.HealthyCount != original.HealthyCount {
		t.Errorf("HealthyCount = %d, want %d", decoded.HealthyCount, original.HealthyCount)
	}
	if decoded.FailedCount != original.FailedCount {
		t.Errorf("FailedCount = %d, want %d", decoded.FailedCount, original.FailedCount)
	}
}

func TestServiceExportZeroValues(t *testing.T) {
	var se ServiceExport
	if se.Name != "" {
		t.Errorf("zero ServiceExport.Name = %q, want empty string", se.Name)
	}
	if se.Status != "" {
		t.Errorf("zero ServiceExport.Status = %q, want empty string", se.Status)
	}
	if se.TargetClusters != nil {
		t.Errorf("zero ServiceExport.TargetClusters = %v, want nil", se.TargetClusters)
	}
}

func TestServiceImportZeroValues(t *testing.T) {
	var si ServiceImport
	if si.Name != "" {
		t.Errorf("zero ServiceImport.Name = %q, want empty string", si.Name)
	}
	if si.Type != "" {
		t.Errorf("zero ServiceImport.Type = %q, want empty string", si.Type)
	}
	if si.Endpoints != 0 {
		t.Errorf("zero ServiceImport.Endpoints = %d, want 0", si.Endpoints)
	}
}
