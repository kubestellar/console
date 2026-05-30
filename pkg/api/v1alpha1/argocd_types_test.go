package v1alpha1

import (
	"encoding/json"
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/runtime/schema"
)

func TestArgoGVRs(t *testing.T) {
	tests := []struct {
		name     string
		gvr      schema.GroupVersionResource
		expGroup string
		expVer   string
		expRes   string
	}{
		{
			name:     "ArgoApplicationGVR",
			gvr:      ArgoApplicationGVR,
			expGroup: "argoproj.io",
			expVer:   "v1alpha1",
			expRes:   "applications",
		},
		{
			name:     "ArgoApplicationSetGVR",
			gvr:      ArgoApplicationSetGVR,
			expGroup: "argoproj.io",
			expVer:   "v1alpha1",
			expRes:   "applicationsets",
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

func TestArgoApplicationJSONRoundTrip(t *testing.T) {
	original := ArgoApplication{
		Name:         "test-app",
		Namespace:    "argocd",
		Cluster:      "cluster-1",
		SyncStatus:   "Synced",
		HealthStatus: "Healthy",
		Source: ArgoApplicationSource{
			RepoURL:        "https://github.com/example/repo",
			Path:           "manifests",
			TargetRevision: "main",
		},
		LastSynced: "2 hours ago",
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded ArgoApplication
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Name != original.Name {
		t.Errorf("Name = %q, want %q", decoded.Name, original.Name)
	}
	if decoded.SyncStatus != original.SyncStatus {
		t.Errorf("SyncStatus = %q, want %q", decoded.SyncStatus, original.SyncStatus)
	}
	if decoded.HealthStatus != original.HealthStatus {
		t.Errorf("HealthStatus = %q, want %q", decoded.HealthStatus, original.HealthStatus)
	}
	if decoded.Source.RepoURL != original.Source.RepoURL {
		t.Errorf("Source.RepoURL = %q, want %q", decoded.Source.RepoURL, original.Source.RepoURL)
	}
}

func TestArgoApplicationListJSONRoundTrip(t *testing.T) {
	original := ArgoApplicationList{
		Items: []ArgoApplication{
			{Name: "app-1", Namespace: "argocd", SyncStatus: "Synced", HealthStatus: "Healthy"},
			{Name: "app-2", Namespace: "argocd", SyncStatus: "OutOfSync", HealthStatus: "Degraded"},
		},
		TotalCount: 2,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded ArgoApplicationList
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.TotalCount != original.TotalCount {
		t.Errorf("TotalCount = %d, want %d", decoded.TotalCount, original.TotalCount)
	}
	if len(decoded.Items) != len(original.Items) {
		t.Errorf("Items length = %d, want %d", len(decoded.Items), len(original.Items))
	}
}

func TestArgoApplicationSetJSONRoundTrip(t *testing.T) {
	original := ArgoApplicationSet{
		Name:       "test-appset",
		Namespace:  "argocd",
		Cluster:    "cluster-1",
		Generators: []string{"list", "cluster", "git"},
		Template:   "app-template",
		SyncPolicy: "Automated",
		Status:     "Ready",
		AppCount:   5,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded ArgoApplicationSet
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Name != original.Name {
		t.Errorf("Name = %q, want %q", decoded.Name, original.Name)
	}
	if decoded.SyncPolicy != original.SyncPolicy {
		t.Errorf("SyncPolicy = %q, want %q", decoded.SyncPolicy, original.SyncPolicy)
	}
	if decoded.AppCount != original.AppCount {
		t.Errorf("AppCount = %d, want %d", decoded.AppCount, original.AppCount)
	}
	if len(decoded.Generators) != len(original.Generators) {
		t.Errorf("Generators length = %d, want %d", len(decoded.Generators), len(original.Generators))
	}
}

func TestArgoApplicationSetListJSONRoundTrip(t *testing.T) {
	original := ArgoApplicationSetList{
		Items: []ArgoApplicationSet{
			{Name: "appset-1", Namespace: "argocd", AppCount: 3},
			{Name: "appset-2", Namespace: "argocd", AppCount: 7},
		},
		TotalCount: 2,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded ArgoApplicationSetList
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.TotalCount != original.TotalCount {
		t.Errorf("TotalCount = %d, want %d", decoded.TotalCount, original.TotalCount)
	}
	if len(decoded.Items) != len(original.Items) {
		t.Errorf("Items length = %d, want %d", len(decoded.Items), len(original.Items))
	}
}

func TestArgoHealthSummaryJSONRoundTrip(t *testing.T) {
	original := ArgoHealthSummary{
		Healthy:     10,
		Degraded:    2,
		Progressing: 3,
		Missing:     1,
		Unknown:     0,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded ArgoHealthSummary
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Healthy != original.Healthy {
		t.Errorf("Healthy = %d, want %d", decoded.Healthy, original.Healthy)
	}
	if decoded.Degraded != original.Degraded {
		t.Errorf("Degraded = %d, want %d", decoded.Degraded, original.Degraded)
	}
	if decoded.Progressing != original.Progressing {
		t.Errorf("Progressing = %d, want %d", decoded.Progressing, original.Progressing)
	}
}

func TestArgoSyncSummaryJSONRoundTrip(t *testing.T) {
	original := ArgoSyncSummary{
		Synced:    12,
		OutOfSync: 3,
		Unknown:   1,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded ArgoSyncSummary
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Synced != original.Synced {
		t.Errorf("Synced = %d, want %d", decoded.Synced, original.Synced)
	}
	if decoded.OutOfSync != original.OutOfSync {
		t.Errorf("OutOfSync = %d, want %d", decoded.OutOfSync, original.OutOfSync)
	}
	if decoded.Unknown != original.Unknown {
		t.Errorf("Unknown = %d, want %d", decoded.Unknown, original.Unknown)
	}
}

func TestArgoSyncRequestJSONRoundTrip(t *testing.T) {
	original := ArgoSyncRequest{
		AppName:   "test-app",
		Namespace: "argocd",
		Cluster:   "cluster-1",
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded ArgoSyncRequest
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.AppName != original.AppName {
		t.Errorf("AppName = %q, want %q", decoded.AppName, original.AppName)
	}
	if decoded.Namespace != original.Namespace {
		t.Errorf("Namespace = %q, want %q", decoded.Namespace, original.Namespace)
	}
	if decoded.Cluster != original.Cluster {
		t.Errorf("Cluster = %q, want %q", decoded.Cluster, original.Cluster)
	}
}

func TestArgoStatusResponseJSONRoundTrip(t *testing.T) {
	original := ArgoStatusResponse{
		Detected: true,
		Clusters: []ArgoClusterStatus{
			{
				Name:               "cluster-1",
				HasApplications:    true,
				HasApplicationSets: true,
			},
			{
				Name:               "cluster-2",
				HasApplications:    false,
				HasApplicationSets: false,
			},
		},
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded ArgoStatusResponse
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Detected != original.Detected {
		t.Errorf("Detected = %v, want %v", decoded.Detected, original.Detected)
	}
	if len(decoded.Clusters) != len(original.Clusters) {
		t.Errorf("Clusters length = %d, want %d", len(decoded.Clusters), len(original.Clusters))
	}
}

func TestArgoClusterStatusJSONRoundTrip(t *testing.T) {
	original := ArgoClusterStatus{
		Name:               "test-cluster",
		HasApplications:    true,
		HasApplicationSets: false,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded ArgoClusterStatus
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Name != original.Name {
		t.Errorf("Name = %q, want %q", decoded.Name, original.Name)
	}
	if decoded.HasApplications != original.HasApplications {
		t.Errorf("HasApplications = %v, want %v", decoded.HasApplications, original.HasApplications)
	}
	if decoded.HasApplicationSets != original.HasApplicationSets {
		t.Errorf("HasApplicationSets = %v, want %v", decoded.HasApplicationSets, original.HasApplicationSets)
	}
}

func TestTimeSinceArgo(t *testing.T) {
	tests := []struct {
		name string
		time time.Time
		want string
	}{
		{
			name: "zero time",
			time: time.Time{},
			want: "",
		},
		{
			name: "just now",
			time: time.Now().Add(-30 * time.Second),
			want: "just now",
		},
		{
			name: "1 minute ago",
			time: time.Now().Add(-1 * time.Minute),
			want: "1 minute ago",
		},
		{
			name: "5 minutes ago",
			time: time.Now().Add(-5 * time.Minute),
			want: "5 minutes ago",
		},
		{
			name: "1 hour ago",
			time: time.Now().Add(-1 * time.Hour),
			want: "1 hour ago",
		},
		{
			name: "3 hours ago",
			time: time.Now().Add(-3 * time.Hour),
			want: "3 hours ago",
		},
		{
			name: "1 day ago",
			time: time.Now().Add(-24 * time.Hour),
			want: "1 day ago",
		},
		{
			name: "5 days ago",
			time: time.Now().Add(-5 * 24 * time.Hour),
			want: "5 days ago",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := TimeSinceArgo(tc.time)
			if got != tc.want {
				t.Errorf("TimeSinceArgo(%v) = %q, want %q", tc.time, got, tc.want)
			}
		})
	}
}

func TestTimeSinceArgoEdgeCases(t *testing.T) {
	now := time.Now()

	exactlyOneMinute := TimeSinceArgo(now.Add(-1 * time.Minute))
	if exactlyOneMinute != "1 minute ago" {
		t.Errorf("TimeSinceArgo(1 minute) = %q, want %q", exactlyOneMinute, "1 minute ago")
	}

	exactlyOneHour := TimeSinceArgo(now.Add(-1 * time.Hour))
	if exactlyOneHour != "1 hour ago" {
		t.Errorf("TimeSinceArgo(1 hour) = %q, want %q", exactlyOneHour, "1 hour ago")
	}

	exactlyOneDay := TimeSinceArgo(now.Add(-24 * time.Hour))
	if exactlyOneDay != "1 day ago" {
		t.Errorf("TimeSinceArgo(1 day) = %q, want %q", exactlyOneDay, "1 day ago")
	}

	almostOneMinute := TimeSinceArgo(now.Add(-59 * time.Second))
	if almostOneMinute != "just now" {
		t.Errorf("TimeSinceArgo(59 seconds) = %q, want %q", almostOneMinute, "just now")
	}
}

func TestArgoApplicationZeroValues(t *testing.T) {
	var app ArgoApplication
	if app.Name != "" {
		t.Errorf("zero ArgoApplication.Name = %q, want empty string", app.Name)
	}
	if app.SyncStatus != "" {
		t.Errorf("zero ArgoApplication.SyncStatus = %q, want empty string", app.SyncStatus)
	}
	if app.HealthStatus != "" {
		t.Errorf("zero ArgoApplication.HealthStatus = %q, want empty string", app.HealthStatus)
	}
}

func TestArgoApplicationSetZeroValues(t *testing.T) {
	var appset ArgoApplicationSet
	if appset.Name != "" {
		t.Errorf("zero ArgoApplicationSet.Name = %q, want empty string", appset.Name)
	}
	if appset.AppCount != 0 {
		t.Errorf("zero ArgoApplicationSet.AppCount = %d, want 0", appset.AppCount)
	}
	if appset.Generators != nil {
		t.Errorf("zero ArgoApplicationSet.Generators = %v, want nil", appset.Generators)
	}
}
