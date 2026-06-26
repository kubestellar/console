#!/bin/bash

# Add new imports to files that reference feedback, mcp, or github handlers
files=$(grep -l "handlers\.NewFeedbackHandler\|handlers\.LoadFeedbackConfig\|handlers\.FeedbackHandler\|handlers\.NewMCPHandlers\|handlers\.MCPHandlers\|handlers\.NewGitHubPipelinesHandler\|handlers\.NewGitHubProxyHandler\|handlers\.GitHubPipelinesHandler\|handlers\.GitHubProxyHandler" pkg/api/*.go)

for file in $files; do
  # Check if file needs feedback import
  if grep -q "handlers\.NewFeedbackHandler\|handlers\.LoadFeedbackConfig\|handlers\.FeedbackHandler" "$file"; then
    # Add feedback import if not present
    if ! grep -q "github.com/kubestellar/console/pkg/api/handlers/feedback" "$file"; then
      sed -i '/github\.com\/kubestellar\/console\/pkg\/api\/handlers"/a\	"github.com/kubestellar/console/pkg/api/handlers/feedback"' "$file"
    fi
  fi
  
  # Check if file needs mcp import
  if grep -q "handlers\.NewMCPHandlers\|handlers\.MCPHandlers" "$file"; then
    # Add mcp import if not present
    if ! grep -q "github.com/kubestellar/console/pkg/api/handlers/mcp" "$file"; then
      sed -i '/github\.com\/kubestellar\/console\/pkg\/api\/handlers"/a\	"github.com/kubestellar/console/pkg/api/handlers/mcp"' "$file"
    fi
  fi
  
  # Check if file needs github import
  if grep -q "handlers\.NewGitHubPipelinesHandler\|handlers\.NewGitHubProxyHandler\|handlers\.GitHubPipelinesHandler\|handlers\.GitHubProxyHandler" "$file"; then
    # Add github import if not present (need to avoid collision with google/go-github)
    if ! grep -q "github.com/kubestellar/console/pkg/api/handlers/github" "$file"; then
      sed -i '/github\.com\/kubestellar\/console\/pkg\/api\/handlers"/a\	githubhandlers "github.com/kubestellar/console/pkg/api/handlers/github"' "$file"
    fi
  fi
done

# Now update the references
for file in $files; do
  sed -i 's/handlers\.NewFeedbackHandler/feedback.NewFeedbackHandler/g' "$file"
  sed -i 's/handlers\.LoadFeedbackConfig/feedback.LoadFeedbackConfig/g' "$file"
  sed -i 's/\*handlers\.FeedbackHandler/*feedback.FeedbackHandler/g' "$file"
  
  sed -i 's/handlers\.NewMCPHandlers/mcp.NewMCPHandlers/g' "$file"
  sed -i 's/\*handlers\.MCPHandlers/*mcp.MCPHandlers/g' "$file"
  
  sed -i 's/handlers\.NewGitHubPipelinesHandler/githubhandlers.NewGitHubPipelinesHandler/g' "$file"
  sed -i 's/handlers\.NewGitHubProxyHandler/githubhandlers.NewGitHubProxyHandler/g' "$file"
  sed -i 's/\*handlers\.GitHubPipelinesHandler/*githubhandlers.GitHubPipelinesHandler/g' "$file"
  sed -i 's/\*handlers\.GitHubProxyHandler/*githubhandlers.GitHubProxyHandler/g' "$file"
done

echo "Import updates complete"
