package api

import (
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/api/handlers/feedback"
	"github.com/kubestellar/console/pkg/api/handlers/rewards"
	"github.com/kubestellar/console/pkg/store"
)

type feedbackRouteGroup struct {
	app         *fiber.App
	store       store.Store
	githubToken string
	rewardOrgs  string
	background  *backgroundServices
}

func newFeedbackRouteGroup(app *fiber.App, store store.Store, githubToken string, rewardOrgs string, background *backgroundServices) *feedbackRouteGroup {
	return &feedbackRouteGroup{
		app:         app,
		store:       store,
		githubToken: githubToken,
		rewardOrgs:  rewardOrgs,
		background:  background,
	}
}

func (g *feedbackRouteGroup) Register(routes *routeSetupContext) {
	api := routes.api
	feedbackHandler := routes.feedback
	if feedbackHandler == nil {
		feedbackHandler = feedback.NewFeedbackHandler(g.store, feedback.LoadFeedbackConfig())
		routes.feedback = feedbackHandler
	}

	api.Get("/feedback/requests", feedbackHandler.ListFeatureRequests)
	api.Get("/feedback/issue-link-capabilities", feedbackHandler.GetIssueLinkCapabilities)
	api.Get("/feedback/queue", feedbackHandler.ListAllFeatureRequests)
	api.Get("/feedback/requests/:id", feedbackHandler.GetFeatureRequest)
	api.Post("/feedback/requests/:id/feedback", feedbackHandler.SubmitFeedback)
	api.Post("/feedback/requests/:id/close", feedbackHandler.CloseRequest)
	api.Patch("/feedback/:id/close", feedbackHandler.CloseRequest)
	api.Post("/feedback/requests/:id/request-update", feedbackHandler.RequestUpdate)
	api.Post("/feedback/:id/reopen", feedbackHandler.ReopenRequest)
	api.Get("/feedback/preview/:pr_number", feedbackHandler.CheckPreviewStatus)
	api.Get("/notifications", feedbackHandler.GetNotifications)
	api.Get("/notifications/unread-count", feedbackHandler.GetUnreadCount)
	api.Post("/notifications/:id/read", feedbackHandler.MarkNotificationRead)
	api.Post("/notifications/read-all", feedbackHandler.MarkAllNotificationsRead)

	rewardsHandler := rewards.NewRewardsHandler(rewards.RewardsConfig{
		GitHubToken: g.githubToken,
		Orgs:        g.rewardOrgs,
	})
	if g.background != nil {
		g.background.rewardsHandler = rewardsHandler
	}
	api.Get("/rewards/github", rewardsHandler.GetGitHubRewards)

	badgeHandler := rewards.NewBadgeHandler(rewardsHandler, g.store)
	g.app.Get("/api/rewards/badge/:github_login", routes.publicLimiter, badgeHandler.GetBadge)

	rewardsPersistence := rewards.NewRewardsPersistenceHandler(g.store)
	api.Get("/rewards/me", rewardsPersistence.GetUserRewards)
	api.Put("/rewards/me", rewardsPersistence.UpdateUserRewards)
	api.Post("/rewards/coins", rewardsPersistence.IncrementCoins)
	api.Post("/rewards/daily-bonus", rewardsPersistence.ClaimDailyBonus)

	tokenUsage := handlers.NewTokenUsageHandler(g.store)
	api.Get("/token-usage/me", tokenUsage.GetUserTokenUsage)
	api.Post("/token-usage/me", tokenUsage.UpdateUserTokenUsage)
	api.Post("/token-usage/delta", tokenUsage.AddTokenDelta)
}
