package mcp

import (
	"testing"
	"time"
)

func newBridge() *Bridge {
	return &Bridge{config: BridgeConfig{}}
}

func TestParseClustersResult_Success(t *testing.T) {
	b := newBridge()
	result := &CallToolResult{
		Content: []ContentItem{
			{Type: "text", Text: `[{"name":"cluster1","context":"ctx1","healthy":true,"nodeCount":3}]`},
		},
	}
	clusters, err := b.parseClustersResult(result)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(clusters) != 1 {
		t.Fatalf("expected 1 cluster, got %d", len(clusters))
	}
	if clusters[0].Name != "cluster1" {
		t.Errorf("expected name cluster1, got %s", clusters[0].Name)
	}
	if clusters[0].NodeCount != 3 {
		t.Errorf("expected nodeCount 3, got %d", clusters[0].NodeCount)
	}
}

func TestParseClustersResult_ErrorResponse(t *testing.T) {
	b := newBridge()
	result := &CallToolResult{
		IsError: true,
		Content: []ContentItem{
			{Type: "text", Text: "something went wrong"},
		},
	}
	_, err := b.parseClustersResult(result)
	if err == nil {
		t.Fatal("expected error for IsError response")
	}
}

func TestParseClustersResult_ErrorEmptyContent(t *testing.T) {
	b := newBridge()
	result := &CallToolResult{
		IsError: true,
		Content: []ContentItem{},
	}
	_, err := b.parseClustersResult(result)
	if err == nil {
		t.Fatal("expected error for IsError with empty content")
	}
}

func TestParseClustersResult_NoTextContent(t *testing.T) {
	b := newBridge()
	result := &CallToolResult{
		Content: []ContentItem{
			{Type: "image", Text: "not text"},
		},
	}
	_, err := b.parseClustersResult(result)
	if err == nil {
		t.Fatal("expected error when no text content present")
	}
}

func TestParseClustersResult_InvalidJSON(t *testing.T) {
	b := newBridge()
	result := &CallToolResult{
		Content: []ContentItem{
			{Type: "text", Text: "not valid json"},
		},
	}
	_, err := b.parseClustersResult(result)
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestParseClustersResult_EmptyArray(t *testing.T) {
	b := newBridge()
	result := &CallToolResult{
		Content: []ContentItem{
			{Type: "text", Text: "[]"},
		},
	}
	_, err := b.parseClustersResult(result)
	if err == nil {
		t.Fatal("expected error for empty clusters array")
	}
}

func TestParseHealthResult_Success(t *testing.T) {
	b := newBridge()
	result := &CallToolResult{
		Content: []ContentItem{
			{Type: "text", Text: `{"cluster":"prod","healthy":true,"reachable":true,"nodeCount":5,"readyNodes":5,"podCount":42,"cpuCores":16,"memoryBytes":1073741824}`},
		},
	}
	health, err := b.parseHealthResult(result)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if health.Cluster != "prod" {
		t.Errorf("expected cluster prod, got %s", health.Cluster)
	}
	if !health.Healthy {
		t.Error("expected healthy=true")
	}
	if health.NodeCount != 5 {
		t.Errorf("expected nodeCount 5, got %d", health.NodeCount)
	}
}

func TestParseHealthResult_Error(t *testing.T) {
	b := newBridge()
	result := &CallToolResult{
		IsError: true,
		Content: []ContentItem{
			{Type: "text", Text: "timeout"},
		},
	}
	_, err := b.parseHealthResult(result)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestParseHealthResult_NoContent(t *testing.T) {
	b := newBridge()
	result := &CallToolResult{
		Content: []ContentItem{},
	}
	_, err := b.parseHealthResult(result)
	if err == nil {
		t.Fatal("expected error for empty content")
	}
}

func TestParsePodsResult_Success(t *testing.T) {
	b := newBridge()
	result := &CallToolResult{
		Content: []ContentItem{
			{Type: "text", Text: `[{"name":"nginx-abc","namespace":"default","status":"Running","ready":"1/1","restarts":0,"age":"2d"}]`},
		},
	}
	pods, err := b.parsePodsResult(result)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(pods) != 1 {
		t.Fatalf("expected 1 pod, got %d", len(pods))
	}
	if pods[0].Name != "nginx-abc" {
		t.Errorf("expected pod name nginx-abc, got %s", pods[0].Name)
	}
}

func TestParsePodsResult_EmptyArray(t *testing.T) {
	b := newBridge()
	result := &CallToolResult{
		Content: []ContentItem{
			{Type: "text", Text: "[]"},
		},
	}
	_, err := b.parsePodsResult(result)
	if err == nil {
		t.Fatal("expected error for empty pods array")
	}
}

func TestParsePodIssuesResult_Success(t *testing.T) {
	b := newBridge()
	result := &CallToolResult{
		Content: []ContentItem{
			{Type: "text", Text: `[{"name":"crash-pod","namespace":"kube-system","status":"CrashLoopBackOff","issues":["OOMKilled"],"restarts":15}]`},
		},
	}
	issues, err := b.parsePodIssuesResult(result)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(issues) != 1 {
		t.Fatalf("expected 1 issue, got %d", len(issues))
	}
	if issues[0].Restarts != 15 {
		t.Errorf("expected 15 restarts, got %d", issues[0].Restarts)
	}
}

func TestParsePodIssuesResult_Error(t *testing.T) {
	b := newBridge()
	result := &CallToolResult{
		IsError: true,
		Content: []ContentItem{},
	}
	_, err := b.parsePodIssuesResult(result)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestParseEventsResult_Success(t *testing.T) {
	b := newBridge()
	now := time.Now().Format(time.RFC3339)
	result := &CallToolResult{
		Content: []ContentItem{
			{Type: "text", Text: `[{"type":"Warning","reason":"BackOff","message":"Back-off restarting","object":"pod/crash","namespace":"default","count":5,"firstSeen":"` + now + `","lastSeen":"` + now + `"}]`},
		},
	}
	events, err := b.parseEventsResult(result)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].Reason != "BackOff" {
		t.Errorf("expected reason BackOff, got %s", events[0].Reason)
	}
	if events[0].Count != 5 {
		t.Errorf("expected count 5, got %d", events[0].Count)
	}
}

func TestParseEventsResult_InvalidJSON(t *testing.T) {
	b := newBridge()
	result := &CallToolResult{
		Content: []ContentItem{
			{Type: "text", Text: "{not json array}"},
		},
	}
	_, err := b.parseEventsResult(result)
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestParseEventsResult_EmptyArray(t *testing.T) {
	b := newBridge()
	result := &CallToolResult{
		Content: []ContentItem{
			{Type: "text", Text: "[]"},
		},
	}
	_, err := b.parseEventsResult(result)
	if err == nil {
		t.Fatal("expected error for empty events array")
	}
}
