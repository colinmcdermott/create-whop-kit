export interface ProvisionResult {
  connectionString: string;
  provider: string;
  note?: string; // e.g. "Database expires in 24h unless claimed"
}

export interface DbProvider {
  name: string;
  description: string;
  /** Check if provider CLI is available */
  isInstalled: () => boolean;
  /** Install the provider CLI */
  install: () => Promise<boolean>;
  /** Provision a database and return the connection string */
  provision: (projectName: string) => Promise<ProvisionResult | null>;
}
