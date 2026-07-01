package k8s

import "testing"

func TestUnstructuredNestedMap_Found(t *testing.T) {
	obj := map[string]interface{}{
		"spec": map[string]interface{}{
			"template": map[string]interface{}{
				"metadata": map[string]interface{}{
					"labels": map[string]interface{}{
						"app": "test",
					},
				},
			},
		},
	}
	result, found, err := unstructuredNestedMap(obj, "spec", "template", "metadata", "labels")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !found {
		t.Fatal("expected found=true")
	}
	if result["app"] != "test" {
		t.Errorf("result[app] = %v, want %q", result["app"], "test")
	}
}

func TestUnstructuredNestedMap_NotFound(t *testing.T) {
	obj := map[string]interface{}{
		"spec": map[string]interface{}{},
	}
	result, found, err := unstructuredNestedMap(obj, "spec", "missing")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if found {
		t.Error("expected found=false for missing key")
	}
	if result != nil {
		t.Error("expected nil result for missing key")
	}
}

func TestUnstructuredNestedMap_WrongType(t *testing.T) {
	obj := map[string]interface{}{
		"spec": "not-a-map",
	}
	result, found, err := unstructuredNestedMap(obj, "spec", "child")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if found {
		t.Error("expected found=false when intermediate is not a map")
	}
	if result != nil {
		t.Error("expected nil result when intermediate is not a map")
	}
}

func TestUnstructuredNestedMap_LeafNotMap(t *testing.T) {
	obj := map[string]interface{}{
		"data": "string-value",
	}
	result, found, err := unstructuredNestedMap(obj, "data")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if found {
		t.Error("expected found=false when leaf is not a map")
	}
	if result != nil {
		t.Error("expected nil result when leaf is not a map")
	}
}

func TestUnstructuredNestedMap_EmptyPath(t *testing.T) {
	obj := map[string]interface{}{
		"key": "value",
	}
	result, found, err := unstructuredNestedMap(obj)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !found {
		t.Error("expected found=true with empty path (returns obj itself)")
	}
	if result == nil {
		t.Error("expected non-nil result with empty path")
	}
}

func TestUnstructuredNestedSlice_Found(t *testing.T) {
	obj := map[string]interface{}{
		"spec": map[string]interface{}{
			"containers": []interface{}{"nginx", "sidecar"},
		},
	}
	result, found, err := unstructuredNestedSlice(obj, "spec", "containers")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !found {
		t.Fatal("expected found=true")
	}
	if len(result) != 2 {
		t.Fatalf("len(result) = %d, want 2", len(result))
	}
	if result[0] != "nginx" {
		t.Errorf("result[0] = %v, want %q", result[0], "nginx")
	}
}

func TestUnstructuredNestedSlice_NotFound(t *testing.T) {
	obj := map[string]interface{}{
		"spec": map[string]interface{}{},
	}
	result, found, err := unstructuredNestedSlice(obj, "spec", "missing")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if found {
		t.Error("expected found=false")
	}
	if result != nil {
		t.Error("expected nil result")
	}
}

func TestUnstructuredNestedSlice_WrongType(t *testing.T) {
	obj := map[string]interface{}{
		"data": map[string]interface{}{
			"items": "not-a-slice",
		},
	}
	result, found, err := unstructuredNestedSlice(obj, "data", "items")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if found {
		t.Error("expected found=false when leaf is not a slice")
	}
	if result != nil {
		t.Error("expected nil result when leaf is not a slice")
	}
}

func TestUnstructuredNestedSlice_IntermediateNotMap(t *testing.T) {
	obj := map[string]interface{}{
		"spec": 42,
	}
	result, found, err := unstructuredNestedSlice(obj, "spec", "containers")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if found {
		t.Error("expected found=false")
	}
	if result != nil {
		t.Error("expected nil result")
	}
}

func TestUnstructuredNestedSlice_EmptySlice(t *testing.T) {
	obj := map[string]interface{}{
		"items": []interface{}{},
	}
	result, found, err := unstructuredNestedSlice(obj, "items")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !found {
		t.Error("expected found=true for empty slice")
	}
	if len(result) != 0 {
		t.Errorf("len(result) = %d, want 0", len(result))
	}
}
