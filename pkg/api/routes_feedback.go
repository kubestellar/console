package api

import "github.com/kubestellar/console/pkg/api/handlers"

// setupFeedbackRoutes registers feedback, rewards, badges, and token usage routes.
func (s *Server) setupFeedbackRoutes(routes *routeSetupContext) {
	api := routes.api
	feedback := routes.feedback
	if feedback == nil {
		feedback = handlers.NewFeedbackHandler(s.store, handlers.LoadFeedbackConfig())
		routes.feedback = feedback
	}

	api.Get("/feedback/requests", feedback.ListFeatureRequests)
	api.Get("/feedback/issue-link-capabilities", feedback.GetIssueLinkCapabilities)
	api.Get("/feedback/queue", feedback.ListAllFeatureRequests)
	api.Get("/feedback/requests/:id", feedback.GetFeatureRequest)
	api.Post("/feedback/requests/:id/feedback", feedback.SubmitFeedback)
	api.Post("/feedback/requests/:id/close", feedback.CloseRequest)
	api.Patch("/feedback/:id/close", feedback.CloseRequest)
	api.Post("/feedback/requests/:id/request-update", feedback.RequestUpdate)
	api.Post("/feedback/:id/reopen", feedback.ReopenRequest)
	api.Get("/feedback/preview/:pr_number", feedback.CheckPreviewStatus)
	api.Get("/notifications", feedback.GetNotifications)
	api.Get("/notifications/unread-count", feedback.GetUnreadCount)
	api.Post("/notifications/:id/read", feedback.MarkNotificationRead)
	api.Post("/notifications/read-all", feedback.MarkAllNotificationsRead)

	s.rewardsHandler = handlers.NewRewardsHandler(handlers.RewardsConfig{
		GitHubToken: s.config.GitHubToken,
		Orgs:        s.config.RewardsGitHubOrgs,
	})
	api.Get("/rewards/github", s.rewardsHandler.GetGitHubRewards)

	badgeHandler := handlers.NewBadgeHandler(s.rewardsHandler, s.store)
	s.app.Get("/api/rewards/badge/:github_login", routes.publicLimiter, badgeHandler.GetBadge)

	rewardsPersistence := handlers.NewRewardsPersistenceHandler(s.store)
	api.Get("/rewards/me", rewardsPersistence.GetUserRewards)
	api.Put("/rewards/me", rewardsPersistence.UpdateUserRewards)
	api.Post("/rewards/coins", rewardsPersistence.IncrementCoins)
	api.Post("/rewards/daily-bonus", rewardsPersistence.ClaimDailyBonus)

	tokenUsage := handlers.NewTokenUsageHandler(s.store)
	api.Get("/token-usage/me", tokenUsage.GetUserTokenUsage)
	api.Post("/token-usage/me", tokenUsage.UpdateUserTokenUsage)
	api.Post("/token-usage/delta", tokenUsage.AddTokenDelta)
}
