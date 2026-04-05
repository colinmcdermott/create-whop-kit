export interface DeployResult {
  productionUrl: string;
  githubUrl?: string;
  whopAppId?: string;
  whopApiKey?: string;
  webhookSecret?: string;
}

export interface WhopAppResult {
  id: string;
  client_secret: string;
}

export interface WhopWebhookResult {
  id: string;
  secret: string;
}
