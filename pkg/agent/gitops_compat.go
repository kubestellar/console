package agent

// This file provides backward-compatible aliases for the gitops utilities
// extracted to pkg/agent/gitops/. Only symbols referenced by test files
// in the parent package are kept here.

import (
	"context"
	"net"

	"github.com/kubestellar/console/pkg/agent/gitops"
)

// Type aliases for backward compatibility with tests.
type agentDriftedResource = gitops.DriftedResource
type agentDetectDriftRequest = gitops.DetectDriftRequest
type agentDetectDriftResponse = gitops.DetectDriftResponse
type agentSyncRequest = gitops.SyncRequest
type agentSyncResponse = gitops.SyncResponse

// Constant delegations.
const gitopsDefaultTimeout = gitops.DefaultTimeout
const gitOpsTempDirPrefix = gitops.TempDirPrefix

// gitopsLookupIPAddr is the package-level DNS resolver var.
// Tests override this to inject mock DNS resolution. Assigning to this
// variable also updates the sub-package's LookupIPAddr so calls through
// either path use the same resolver.
var gitopsLookupIPAddr = gitops.LookupIPAddr

// syncLookup propagates the parent-package gitopsLookupIPAddr override to
// the sub-package before calling sub-package functions that perform DNS.
func syncLookup() {
	gitops.LookupIPAddr = gitopsLookupIPAddr
	gitops.ExecCommandContext = execCommandContext
}

// Function delegations for test compatibility.
func normalizeGitopsHost(host string) string { return gitops.NormalizeHost(host) }
func isGitopsBlockedIP(ip net.IP) bool       { return gitops.IsBlockedIP(ip) }
func validateGitopsResolvedIPs(ctx context.Context, host string) error {
	syncLookup()
	return gitops.ValidateResolvedIPs(ctx, host)
}
func validateGitopsRepoURL(repoURL string) error {
	syncLookup()
	return gitops.ValidateRepoURL(repoURL)
}
func validateGitopsBranchName(branch string) error { return gitops.ValidateBranchName(branch) }
func validateGitopsPath(path string) error         { return gitops.ValidatePath(path) }
func gitopsCloneRepo(ctx context.Context, repoURL, branch string) (string, error) {
	syncLookup()
	return gitops.CloneRepo(ctx, repoURL, branch)
}
func gitopsIsKustomizeDir(path string) bool { return gitops.IsKustomizeDir(path) }
func gitopsCleanupTempDir(dir string)       { gitops.CleanupTempDir(dir) }
func gitopsTruncateValue(s string) string   { return gitops.TruncateValue(s) }
func gitopsParseDiffOutput(output, namespace string) []gitops.DriftedResource {
	return gitops.ParseDiffOutput(output, namespace)
}
func gitopsParseApplyOutput(output string) []string { return gitops.ParseApplyOutput(output) }
