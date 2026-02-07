# Contributing to KubeStellar Console

Thank you for your interest in contributing to KubeStellar Console! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Submitting Changes](#submitting-changes)
- [DCO Signoff Requirement](#dco-signoff-requirement)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

This project follows the [CNCF Code of Conduct](https://github.com/cncf/foundation/blob/main/code-of-conduct.md). By participating, you are expected to uphold this code.

## Getting Started

### Prerequisites

- Go 1.21+ (for backend development)
- Node.js 18+ and npm (for frontend development)
- Docker and Docker Compose
- kubectl
- A Kubernetes cluster (kind, minikube, or remote)

### Setting Up Development Environment

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/console.git
   cd console
   ```
3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/kubestellar/console.git
   ```

## Development Workflow

1. Create a feature branch from `main`:
   ```bash
   git checkout main
   git pull upstream main
   git checkout -b my-feature-branch
   ```

2. Make your changes following the coding standards

3. Write or update tests as needed

4. Run the test suite:
   ```bash
   cd web && npm test
   ```

5. Ensure all tests pass before submitting

## Submitting Changes

1. Commit your changes with a clear commit message
2. Push your branch to your fork:
   ```bash
   git push origin my-feature-branch
   ```
3. Create a Pull Request against the `main` branch
4. Address any feedback from reviewers
5. Keep your PR updated with the target branch

## DCO Signoff Requirement

This project requires a Developer Certificate of Origin (DCO) signoff for all contributions. This means each commit must include a line stating:

```
Signed-off-by: Your Name <your-email@example.com>
```

### How to Add a Signoff

**For new commits:**
```bash
git commit -s -m "Your commit message"
```

**For amending existing commits:**
```bash
git commit --amend --signoff
```

**For adding signoff to multiple commits:**
```bash
git rebase -i --signoff main
```

### Using the Signoff Button

GitHub provides a convenient signoff button in the PR interface. Look for the "Signed-off-by" checkbox when reviewing your commits.

### Why DCO is Required

The DCO certifies that you have the right to submit the code and that you agree to the [Developer Certificate of Origin](https://developercertificate.org/). This is a standard open source practice that protects both contributors and the project.

## Coding Standards

### Go Backend

- Follow effective Go patterns
- Use `gofmt` for formatting
- Run `go vet` and `golint` before committing
- Add comprehensive godoc comments

### TypeScript/React Frontend

- Use 4 spaces for indentation
- Follow the TypeScript guidelines in `web/tsconfig.json`
- Use functional components with TypeScript interfaces
- Follow the patterns in `web/src/` structure

### General

- Write meaningful commit messages
- Keep changes focused and minimal
- Include tests for new functionality
- Update documentation as needed

## Testing

### Frontend Tests

```bash
cd web
npm test           # Run unit tests
npm run test:ui    # Run tests with UI
npm run coverage   # Generate coverage report
```

### E2E Tests

```bash
cd web
npm run test:e2e          # Run all E2E tests
npm run test:e2e:headed   # Run with browser visible
```

## Documentation

- Update README.md for user-facing changes
- Add inline comments for complex logic
- Update API documentation for backend changes
- Keep documentation synchronized with code

## Questions?

If you have questions, please:
1. Check existing issues and documentation
2. Open a new issue with your question
3. Reach out through the project's communication channels

## Acknowledgments

Thank you for contributing to KubeStellar Console!
