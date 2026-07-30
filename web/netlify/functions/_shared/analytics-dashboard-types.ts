export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  project_id: string;
}

export interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

export interface GA4Row {
  dimensionValues: { value: string }[];
  metricValues: { value: string }[];
}

export interface DashboardData {
  overview: {
    activeUsers: number;
    sessions: number;
    pageViews: number;
    avgEngagementTime: number;
    bounceRate: number;
    eventsPerSession: number;
  };
  overviewPrevious: {
    activeUsers: number;
    sessions: number;
    pageViews: number;
    avgEngagementTime: number;
    bounceRate: number;
    eventsPerSession: number;
  };
  dailyUsers: { date: string; users: number; sessions: number }[];
  topPages: { page: string; views: number; avgTime: number }[];
  topEvents: { event: string; count: number; users: number }[];
  countries: { country: string; users: number; sessions: number }[];
  trafficSources: { source: string; medium: string; sessions: number; users: number }[];
  devices: { category: string; users: number }[];
  funnel: {
    landing: number;
    login: number;
    commandCopied: number;
    agentConnected: number;
    fixerViewed: number;
    missionStarted: number;
  };
  cncfOutreach: {
    project: string;
    sessions: number;
    users: number;
    events: number;
  }[];
  engagementByPage: {
    page: string;
    avgEngagement: number;
    bounceRate: number;
    views: number;
  }[];
  newVsReturning: { type: string; users: number; sessions: number }[];
  missions: {
    started: number;
    completed: number;
    errored: number;
    rated: number;
    topTypes: { type: string; count: number }[];
  };
  cardPopularity: { card: string; added: number; expanded: number; clicked: number }[];
  featureAdoption: { feature: string; count: number; users: number }[];
  weeklyRetention: { week: string; newUsers: number; returning: number }[];
  errors: { event: string; count: number; detail: string; daily: number[] }[];
  dailyFunnel: { date: string; agentConnected: number }[];
  cachedAt: string;
  propertyId: string;
  dateRange: string;
}

export type FilterMode = "production" | "all";
