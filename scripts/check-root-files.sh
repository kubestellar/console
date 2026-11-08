#!/bin/bash
# scripts/check-root-files.sh
#
# Fails when a git-tracked file at the repository root is not on the explicit
# allowlist below. Large squash merges have repeatedly swept an agent's
# working-directory scratch output (one-off sed/import-patch scripts, issue
# JSON dumps, AI-session verification notes) into the repo root, where it sat
# unreferenced until a manual sweep removed it — see #24716, #24731 and
# #24753. This check catches that class at PR time instead.
#
# Scope:
#   - Only tracked (or staged) top-level FILES are checked; directories and
#     dotfiles (.gitignore, .cursorrules, ...) are always allowed.
#   - Untracked local files are ignored, so a dirty working tree never fails.
#
# Adding a legitimate root file: add its exact name to ALLOWED_ROOT_FILES in
# the same PR that introduces it. Root *.sh entries belong here only when the
# script is referenced by a workflow, Dockerfile, or docs — otherwise put the
# script under scripts/.
#
# Usage:
#   ./scripts/check-root-files.sh            # check the repo containing $PWD
#   make check-root-hygiene                  # same, via the Makefile target
#
# Exit status: 0 when every root file is allowlisted, 1 otherwise.

set -euo pipefail

ALLOWED_ROOT_FILES=(
  # Project docs and governance
  ADOPTERS.md
  AGENTS.md
  CHANGELOG.md
  CLAUDE.md
  CODE_OF_CONDUCT.md
  CONTRIBUTING.md
  DCO
  GOVERNANCE.md
  INVENTORY.md
  LICENSE
  MAINTAINERS.md
  OWNERS
  README.md
  ROADMAP.md
  SECURITY.md
  SECURITY_CONTACTS
  # Build, packaging and tool configuration
  Dockerfile
  Makefile
  crowdin.yml
  go.mod
  go.sum
  netlify.toml
  osv-scanner.toml
  package-lock.json
  skills-lock.json
  # Referenced deploy/start scripts (workflows, Dockerfile, README)
  deploy.sh
  deploy.sh.sha256
  entrypoint.sh
  start-dev.sh
  start.sh
  startup-demo.sh
  startup-oauth.sh
)

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

declare -A allowed=()
for name in "${ALLOWED_ROOT_FILES[@]}"; do
  allowed["$name"]=1
done

UNEXPECTED=()
# Paths without a "/" are top-level files; -z keeps odd names intact.
while IFS= read -r -d '' path; do
  case "$path" in
    */* | .*) continue ;;
  esac
  if [ -z "${allowed[$path]:-}" ]; then
    UNEXPECTED+=("$path")
  fi
done < <(git ls-files -z)

if [ "${#UNEXPECTED[@]}" -eq 0 ]; then
  echo "Root hygiene OK: every top-level file is allowlisted."
  exit 0
fi

echo "::error::${#UNEXPECTED[@]} top-level file(s) are not on the root allowlist:"
printf '  - %s\n' "${UNEXPECTED[@]}"
echo "Scratch output (one-off scripts, issue dumps, session notes) does not belong in the repo root: delete it."
echo "A legitimate new root file must be added to ALLOWED_ROOT_FILES in scripts/check-root-files.sh."
exit 1
