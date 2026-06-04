package api

import (
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers"
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
	feedback := routes.feedback
	if feedback == nil {
		feedback = handlers.NewFeedbackHandler(g.store, handlers.LoadFeedbackConfig())
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

	rewardsHandler := handlers.NewRewardsHandler(handlers.RewardsConfig{
		GitHubToken: g.githubToken,
		Orgs:        g.rewardOrgs,
	})
	if g.background != nil {
		g.background.rewardsHandler = rewardsHandler
	}
	api.Get("/rewards/github", rewardsHandler.GetGitHubRewards)

	badgeHandler := handlers.NewBadgeHandler(rewardsHandler, g.store)
	g.app.Get("/api/rewards/badge/:github_login", routes.publicLimiter, badgeHandler.GetBadge)

	rewardsPersistence := handlers.NewRewardsPersistenceHandler(g.store)
	api.Get("/rewards/me", rewardsPersistence.GetUserRewards)
	api.Put("/rewards/me", rewardsPersistence.UpdateUserRewards)
	api.Post("/rewards/coins", rewardsPersistence.IncrementCoins)
	api.Post("/rewards/daily-bonus", rewardsPersistence.ClaimDailyBonus)

	tokenUsage := handlers.NewTokenUsageHandler(g.store)
	api.Get("/token-usage/me", tokenUsage.GetUserTokenUsage)
	api.Post("/token-usage/me", tokenUsage.UpdateUserTokenUsage)
	api.Post("/token-usage/delta", tokenUsage.AddTokenDelta)
}
