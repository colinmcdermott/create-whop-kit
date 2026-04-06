import type { StepTracker } from "./tracker.js";

export interface DeployResult {
  productionUrl: string;
  githubUrl?: string;
  whopAppId?: string;
  whopApiKey?: string;
  webhookSecret?: string;
  tracker?: StepTracker;
}

export interface WhopAppResult {
  id: string;
  client_secret: string;
}

export interface WhopWebhookResult {
  id: string;
  secret: string;
}
