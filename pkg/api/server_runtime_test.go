package api

import (
"testing"
)

func TestNewServerLifecycle(t *testing.T) {
lc := newServerLifecycle(nil)
if lc == nil {
t.Fatal("expected non-nil serverLifecycle")
}
if lc.done == nil {
t.Error("expected done channel to be initialized")
}
if lc.loadingSrv != nil {
t.Error("expected loadingSrv to be nil when passed nil")
}
}

func TestNewAuthRuntime(t *testing.T) {
ar := newAuthRuntime()
if ar == nil {
t.Fatal("expected non-nil authRuntime")
}
if ar.handler != nil {
t.Error("expected handler to be nil initially")
}
}

func TestNewBackgroundServices(t *testing.T) {
bg := newBackgroundServices()
if bg == nil {
t.Fatal("expected non-nil backgroundServices")
}
if bg.gpuUtilWorker != nil {
t.Error("expected gpuUtilWorker to be nil initially")
}
}

func TestNewQuantumWorkloadCache(t *testing.T) {
qc := newQuantumWorkloadCache()
if qc == nil {
t.Fatal("expected non-nil quantumWorkloadCache")
}
if qc.available {
t.Error("expected available to be false initially")
}
if !qc.refreshedAt.IsZero() {
t.Error("expected refreshedAt to be zero initially")
}
}

func TestQuantumWorkloadCache_DisabledByEnv(t *testing.T) {
t.Setenv("QUANTUM_WORKLOAD_DISABLED", "true")
t.Setenv("QUANTUM_WORKLOAD_RUNNING", "")
qc := newQuantumWorkloadCache()
if qc.isRunning(nil) {
t.Error("expected isRunning=false when QUANTUM_WORKLOAD_DISABLED=true")
}
}

func TestQuantumWorkloadCache_ForcedRunningByEnv(t *testing.T) {
t.Setenv("QUANTUM_WORKLOAD_DISABLED", "")
t.Setenv("QUANTUM_WORKLOAD_RUNNING", "true")
qc := newQuantumWorkloadCache()
if !qc.isRunning(nil) {
t.Error("expected isRunning=true when QUANTUM_WORKLOAD_RUNNING=true")
}
}

func TestQuantumWorkloadCache_NilClient(t *testing.T) {
t.Setenv("QUANTUM_WORKLOAD_DISABLED", "")
t.Setenv("QUANTUM_WORKLOAD_RUNNING", "")
qc := newQuantumWorkloadCache()
if qc.isRunning(nil) {
t.Error("expected isRunning=false with nil k8s client")
}
// After calling isRunning, refreshedAt should be updated (cache populated)
if qc.refreshedAt.IsZero() {
t.Error("expected refreshedAt to be set after isRunning call")
}
}

func TestQuantumWorkloadCache_CacheTTL(t *testing.T) {
t.Setenv("QUANTUM_WORKLOAD_DISABLED", "")
t.Setenv("QUANTUM_WORKLOAD_RUNNING", "")
qc := newQuantumWorkloadCache()

// First call populates cache
result1 := qc.isRunning(nil)
if result1 {
t.Error("expected false with nil client")
}

// Second call should use cache (refreshedAt is recent)
result2 := qc.isRunning(nil)
if result2 != result1 {
t.Error("expected cached result to match first result")
}
}
