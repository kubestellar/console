package k8s

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestNoNestedGPUSubpackage(t *testing.T) {
	t.Helper()

	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("failed to determine current test file path")
	}

	gpuPackagePath := filepath.Join(filepath.Dir(filename), "gpu")
	_, err := os.Stat(gpuPackagePath)
	if err == nil {
		t.Fatalf("pkg/k8s/gpu reintroduces import-cycle risk; keep GPU MultiClusterClient code in pkg/k8s")
	}
	if !os.IsNotExist(err) {
		t.Fatalf("checking pkg/k8s/gpu: %v", err)
	}
}
