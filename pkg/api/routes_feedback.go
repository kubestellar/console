package api

// setupFeedbackRoutes registers feedback, rewards, badges, and token usage
// routes through a focused route group.
func (s *Server) setupFeedbackRoutes(routes *routeSetupContext) {
	newFeedbackRouteGroup(s.app, s.store, s.config.GitHubToken, s.config.RewardsGitHubOrgs, s.background).Register(routes)
}
