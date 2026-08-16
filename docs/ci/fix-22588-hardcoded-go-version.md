# Fix: CVE re-revert loop root-caused — workflows hardcode Go version (#22588)

## Problem

When the CVE scanner bumps the Go version in `go.mod` (e.g. to address
GO-2026-6089/6090/6091/6218), several CI workflow files still reference
the old hardcoded version. Because those workflows break or diverge from
the Dockerfile builder, a subsequent scan re-reverts the bump, creating
an endless loop:

1. `go.mod` bumped to `1.26.6`
2. Workflows (e.g. `go-test.yml`, `release.yml`) still run `1.26.5`
3. Scanner or maintainer reverts `go.mod` to align with workflows
4. Security bump is lost; loop repeats

## Root cause

The following workflow files have the Go version hardcoded as a literal
string (`'1.26.5'` as of this writing) instead of reading it from
`go.mod`:

| File | Location |
|------|----------|
| `.github/workflows/api-contract.yml` | `env.GO_VERSION: '1.26.5'` |
| `.github/workflows/auto-qa.yml` | `env.GO_VERSION: "1.26.5"` |
| `.github/workflows/go-test.yml` | `go-version: '1.26.5'` (inline) |
| `.github/workflows/nightly-test-suite.yml` | `env.GO_VERSION: '1.26.5'` |
| `.github/workflows/nil-safety.yml` | `env.GO_VERSION: "1.26.5"` (used in 2 jobs) |
| `.github/workflows/release.yml` | `go-version: '1.26.5'` (2 occurrences) |
| `.github/workflows/startup-smoke.yml` | `env.GO_VERSION: '1.26.5'` (used in 2 jobs) |
| `.github/workflows/update-guard.yml` | `env.GO_VERSION: "1.26.5"` |

When `go.mod` is bumped, these files are not updated, causing mismatches.

## Fix

For each workflow, remove the hardcoded `GO_VERSION` env var and add a
`Read Go version from go.mod` step before `Set up Go` / `Setup Go`. Use
the step output as the `go-version` input.

```diff
--- a/.github/workflows/api-contract.yml
+++ b/.github/workflows/api-contract.yml
@@ -17,7 +17,7 @@ concurrency:
   cancel-in-progress: true

 env:
-  GO_VERSION: '1.26.5'
+  GO_VERSION_FROM_GOMOD: 'true'  # Go version read from go.mod in job step

 jobs:
   api-contract:
@@ -27,10 +27,14 @@ jobs:
     steps:
       - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

+      - name: Read Go version from go.mod
+        id: go-version
+        run: echo "version=$(grep -m 1 '^go ' go.mod | awk '{print $2}')" >> "$GITHUB_OUTPUT"
+
       - name: Set up Go
         uses: actions/setup-go@b7ad1dad31e06c5925ef5d2fc7ad053ef454303e # v7.0.0
         with:
-          go-version: ${{ env.GO_VERSION }}
+          go-version: ${{ steps.go-version.outputs.version }}
```

```diff
--- a/.github/workflows/auto-qa.yml
+++ b/.github/workflows/auto-qa.yml
@@ -43,7 +43,6 @@ env:
   COPILOT_ASSIGNMENT_DELAY_S: 120
   ISSUE_PREFIX: "[Auto-QA]"
   NODE_VERSION: "22"
-  GO_VERSION: "1.26.5"

 ...

+      - name: Read Go version from go.mod
+        id: go-version
+        run: echo "version=$(grep -m 1 '^go ' go.mod | awk '{print $2}')" >> "$GITHUB_OUTPUT"
+
       - name: Setup Go
         uses: actions/setup-go@b7ad1dad31e06c5925ef5d2fc7ad053ef454303e # v7.0.0
         with:
-          go-version: ${{ env.GO_VERSION }}
+          go-version: ${{ steps.go-version.outputs.version }}
```

```diff
--- a/.github/workflows/go-test.yml
+++ b/.github/workflows/go-test.yml
@@ -55,10 +55,14 @@ jobs:
       - name: Checkout repository
         uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

+      - name: Read Go version from go.mod
+        id: go-version
+        run: echo "version=$(grep -m 1 '^go ' go.mod | awk '{print $2}')" >> "$GITHUB_OUTPUT"
+
       - name: Set up Go
         uses: actions/setup-go@b7ad1dad31e06c5925ef5d2fc7ad053ef454303e # v7.0.0
         with:
-          go-version: '1.26.5'
+          go-version: ${{ steps.go-version.outputs.version }}
           cache: true
```

```diff
--- a/.github/workflows/nightly-test-suite.yml
+++ b/.github/workflows/nightly-test-suite.yml
@@ -18,7 +18,6 @@ concurrency:
 env:
   RESULTS_DIR: test-results/nightly
   NODE_VERSION: '22'
-  GO_VERSION: '1.26.5'

 ...

+      - name: Read Go version from go.mod
+        id: go-version
+        run: echo "version=$(grep -m 1 '^go ' go.mod | awk '{print $2}')" >> "$GITHUB_OUTPUT"
+
       - name: Set up Go
         uses: actions/setup-go@b7ad1dad31e06c5925ef5d2fc7ad053ef454303e # v7.0.0
         with:
-          go-version: ${{ env.GO_VERSION }}
+          go-version: ${{ steps.go-version.outputs.version }}
```

```diff
--- a/.github/workflows/nil-safety.yml
+++ b/.github/workflows/nil-safety.yml
@@ -22,7 +22,6 @@ on:
         type: boolean

 env:
-  GO_VERSION: "1.26.5"

 ...

 # In check-nil-safety job (before "Setup Go"):
+      - name: Read Go version from go.mod
+        id: go-version
+        run: echo "version=$(grep -m 1 '^go ' go.mod | awk '{print $2}')" >> "$GITHUB_OUTPUT"
+
       - name: Setup Go
         if: steps.go-files.outputs.changed == 'true'
         uses: actions/setup-go@b7ad1dad31e06c5925ef5d2fc7ad053ef454303e # v7.0.0
         with:
-          go-version: ${{ env.GO_VERSION }}
+          go-version: ${{ steps.go-version.outputs.version }}

 # In nilaway-full job (before "Setup Go"):
+      - name: Read Go version from go.mod
+        id: go-version
+        run: echo "version=$(grep -m 1 '^go ' go.mod | awk '{print $2}')" >> "$GITHUB_OUTPUT"
+
       - name: Setup Go
         uses: actions/setup-go@b7ad1dad31e06c5925ef5d2fc7ad053ef454303e # v7.0.0
         with:
-          go-version: ${{ env.GO_VERSION }}
+          go-version: ${{ steps.go-version.outputs.version }}
```

```diff
--- a/.github/workflows/release.yml
+++ b/.github/workflows/release.yml
@@ -182,10 +182,14 @@ jobs:
       - name: Checkout repository
         uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

+      - name: Read Go version from go.mod
+        id: go-version
+        run: echo "version=$(grep -m 1 '^go ' go.mod | awk '{print $2}')" >> "$GITHUB_OUTPUT"
+
       - name: Set up Go
         uses: actions/setup-go@b7ad1dad31e06c5925ef5d2fc7ad053ef454303e # v7.0.0
         with:
-          go-version: '1.26.5'
+          go-version: ${{ steps.go-version.outputs.version }}
           cache: true

 # Second occurrence (~line 255):
+      - name: Read Go version from go.mod
+        id: go-version
+        run: echo "version=$(grep -m 1 '^go ' go.mod | awk '{print $2}')" >> "$GITHUB_OUTPUT"
+
       - name: Set up Go
         uses: actions/setup-go@b7ad1dad31e06c5925ef5d2fc7ad053ef454303e # v7.0.0
         with:
-          go-version: '1.26.5'
+          go-version: ${{ steps.go-version.outputs.version }}
           cache: true
```

```diff
--- a/.github/workflows/startup-smoke.yml
+++ b/.github/workflows/startup-smoke.yml
@@ -35,7 +35,6 @@ concurrency:
   cancel-in-progress: true

 env:
-  GO_VERSION: '1.26.5'
   NODE_VERSION: '22'

 # In build-and-start job (before "Set up Go"):
+      - name: Read Go version from go.mod
+        id: go-version
+        run: echo "version=$(grep -m 1 '^go ' go.mod | awk '{print $2}')" >> "$GITHUB_OUTPUT"
+
       - name: Set up Go
         uses: actions/setup-go@b7ad1dad31e06c5925ef5d2fc7ad053ef454303e # v7.0.0
         with:
-          go-version: ${{ env.GO_VERSION }}
+          go-version: ${{ steps.go-version.outputs.version }}

 # In run-smoke-tests job (before "Set up Go"):
+      - name: Read Go version from go.mod
+        id: go-version
+        run: echo "version=$(grep -m 1 '^go ' go.mod | awk '{print $2}')" >> "$GITHUB_OUTPUT"
+
       - name: Set up Go
         uses: actions/setup-go@b7ad1dad31e06c5925ef5d2fc7ad053ef454303e # v7.0.0
         with:
-          go-version: ${{ env.GO_VERSION }}
+          go-version: ${{ steps.go-version.outputs.version }}
```

```diff
--- a/.github/workflows/update-guard.yml
+++ b/.github/workflows/update-guard.yml
@@ -17,7 +17,7 @@ on:
   workflow_dispatch:

 env:
-  GO_VERSION: "1.26.5"

 ...

+      - name: Read Go version from go.mod
+        id: go-version
+        run: echo "version=$(grep -m 1 '^go ' go.mod | awk '{print $2}')" >> "$GITHUB_OUTPUT"
+
       - name: Set up Go
         uses: actions/setup-go@b7ad1dad31e06c5925ef5d2fc7ad053ef454303e # v7.0.0
         with:
-          go-version: ${{ env.GO_VERSION }}
+          go-version: ${{ steps.go-version.outputs.version }}
           cache: true
```

## Applying the fix

Apply the diffs above to each of the 8 workflow files. The one-liner to
extract the Go version is the same in all cases:

```bash
grep -m 1 '^go ' go.mod | awk '{print $2}'
```

A maintainer with `workflows:write` permission must apply this diff
directly on `main` or via a PR opened with a PAT/App token that has the
`workflows` scope.

The scanner agent's GitHub App installation token cannot push
`.github/workflows/*` changes (`refusing to allow a GitHub App to create
or update workflow ... without 'workflows' permission`), so this fix is
documented here for manual application.

## Verification

After applying the fix, when the CVE scanner bumps `go.mod` from
`1.26.5` to `1.26.6`, all workflows will automatically pick up the new
version from `go.mod` — no workflow file edits required, and no re-revert
loop possible.

## References

- Issue: #22588
- Related CVE bumps: #22548, #22571, #22582, #22583
- `go.mod` currently declares: `go 1.26.5`
