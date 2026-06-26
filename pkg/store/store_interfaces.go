package store

// Store preserves backward compatibility while embedding focused persistence
// interfaces so callers can depend on narrower contracts.
type Store interface {
	UserStore
	TeamStore
	OnboardingStore
	DashboardStore
	CardStore
	CardHistoryStore
	PendingSwapStore
	FeatureRequestStore
	PRFeedbackStore
	NotificationStore
	GPUReservationStore
	GPUUtilizationStore
	AuditStore
	AuthStore
	RewardsStore
	EventStore
	ClusterGroupStore
	KBGapStore
	TransactionStore
	LifecycleStore
	StellarStore
}

var (
	_ Store                      = (*SQLiteStore)(nil)
	_ UserStore                  = (*SQLiteStore)(nil)
	_ TeamStore                  = (*SQLiteStore)(nil)
	_ OnboardingStore            = (*SQLiteStore)(nil)
	_ DashboardStore             = (*SQLiteStore)(nil)
	_ CardStore                  = (*SQLiteStore)(nil)
	_ CardHistoryStore           = (*SQLiteStore)(nil)
	_ PendingSwapStore           = (*SQLiteStore)(nil)
	_ FeatureRequestStore        = (*SQLiteStore)(nil)
	_ PRFeedbackStore            = (*SQLiteStore)(nil)
	_ NotificationStore          = (*SQLiteStore)(nil)
	_ GPUReservationStore        = (*SQLiteStore)(nil)
	_ GPUUtilizationStore        = (*SQLiteStore)(nil)
	_ AuditStore                 = (*SQLiteStore)(nil)
	_ TokenStore                 = (*SQLiteStore)(nil)
	_ OAuthCredentialStore       = (*SQLiteStore)(nil)
	_ OAuthStateStore            = (*SQLiteStore)(nil)
	_ AuthStore                  = (*SQLiteStore)(nil)
	_ UserRewardsStore           = (*SQLiteStore)(nil)
	_ UserTokenUsageStore        = (*SQLiteStore)(nil)
	_ RewardsStore               = (*SQLiteStore)(nil)
	_ UserEventStore             = (*SQLiteStore)(nil)
	_ ClusterEventStore          = (*SQLiteStore)(nil)
	_ EventStore                 = (*SQLiteStore)(nil)
	_ ClusterGroupStore          = (*SQLiteStore)(nil)
	_ KBGapStore                 = (*SQLiteStore)(nil)
	_ TransactionStore           = (*SQLiteStore)(nil)
	_ LifecycleStore             = (*SQLiteStore)(nil)
	_ StellarPreferencesStore    = (*SQLiteStore)(nil)
	_ StellarMissionStore        = (*SQLiteStore)(nil)
	_ StellarExecutionStore      = (*SQLiteStore)(nil)
	_ StellarMemoryStore         = (*SQLiteStore)(nil)
	_ StellarActionStore         = (*SQLiteStore)(nil)
	_ StellarNotificationStore   = (*SQLiteStore)(nil)
	_ StellarTaskStore           = (*SQLiteStore)(nil)
	_ StellarWatchStore          = (*SQLiteStore)(nil)
	_ StellarObservationStore    = (*SQLiteStore)(nil)
	_ StellarSolveStore          = (*SQLiteStore)(nil)
	_ StellarActivityStore       = (*SQLiteStore)(nil)
	_ StellarProviderConfigStore = (*SQLiteStore)(nil)
	_ StellarUserSessionStore    = (*SQLiteStore)(nil)
	_ StellarAuditStore          = (*SQLiteStore)(nil)
	_ StellarStore               = (*SQLiteStore)(nil)
)
