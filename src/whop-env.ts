// ---------------------------------------------------------------------------
// Whop environments — production vs sandbox host resolution
// ---------------------------------------------------------------------------
// Whop's sandbox (https://docs.whop.com/developer/guides/sandbox) is a fully
// isolated test environment: separate apps, API keys, plans, and users.
// ---------------------------------------------------------------------------

export type WhopEnvironment = "production" | "sandbox";

export interface WhopHosts {
  /** REST API base including version, e.g. "https://api.whop.com/api/v1" */
  api: string;
  /** Web/dashboard host, e.g. "https://whop.com" */
  web: string;
}

const HOSTS: Record<WhopEnvironment, WhopHosts> = {
  production: {
    api: "https://api.whop.com/api/v1",
    web: "https://whop.com",
  },
  sandbox: {
    api: "https://sandbox-api.whop.com/api/v1",
    web: "https://sandbox.whop.com",
  },
};

export function whopHosts(environment: WhopEnvironment = "production"): WhopHosts {
  return HOSTS[environment];
}

/**
 * Normalize a stored/flag value into a WhopEnvironment. Only the exact
 * string "sandbox" selects sandbox; everything else is production.
 */
export function resolveWhopEnvironment(value: string | null | undefined): WhopEnvironment {
  return value === "sandbox" ? "sandbox" : "production";
}

/**
 * The env var name templates read the environment from.
 * Next.js needs the NEXT_PUBLIC_ prefix so client components see it.
 */
export function whopEnvVarName(framework: string): string {
  return framework === "nextjs" ? "NEXT_PUBLIC_WHOP_ENVIRONMENT" : "WHOP_ENVIRONMENT";
}
