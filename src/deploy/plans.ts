import * as p from "@clack/prompts";
import pc from "picocolors";
import { whopHosts, type WhopEnvironment } from "../whop-env.js";
import {
  generatePlansObject,
  rewriteDefinePlans,
  projectSupportsHiddenFlag,
  type RewriteResult,
} from "../scaffolding/plan-codegen.js";

function headers(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

const FETCH_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlanTier {
  key: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
}

interface CreatedPlan {
  key: string;
  name: string;
  productId: string;
  monthlyPlanId: string;
  yearlyPlanId: string | null;
  monthlyPrice: number;
  yearlyPrice: number;
}

export interface PlanSetupResult {
  tiers: CreatedPlan[];
  includeFree: boolean;
  freePlanId: string | null;
  includeYearly: boolean;
}

// Tier keys become definePlans() keys and env var names
// (NEXT_PUBLIC_WHOP_{KEY}_PLAN_ID), so they must be identifier-safe.
const TIER_KEY_RE = /^[a-z][a-z0-9_]*$/;

export function tierKeyFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function createProduct(
  apiKey: string,
  companyId: string,
  title: string,
  environment: WhopEnvironment,
): Promise<string | null> {
  try {
    const res = await fetch(`${whopHosts(environment).api}/products`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify({
        company_id: companyId,
        title,
        visibility: "visible",
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.ok) {
      const data = (await res.json()) as { id: string };
      return data.id;
    }
    const err = await res.text().catch(() => "");
    console.error(`[Whop API] Create product failed: ${err.slice(0, 200)}`);
    return null;
  } catch (err) {
    console.error(`[Whop API] Create product error: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function createPlan(
  apiKey: string,
  companyId: string,
  productId: string,
  price: number,
  billingPeriod: number, // 30 for monthly, 365 for yearly
  environment: WhopEnvironment,
): Promise<string | null> {
  try {
    const body: Record<string, unknown> = {
      company_id: companyId,
      access_pass_id: productId,
      plan_type: price === 0 ? "one_time" : "renewal",
    };

    if (price === 0) {
      body.initial_price = 0;
    } else {
      body.initial_price = price;
      body.renewal_price = price;
      body.billing_period = billingPeriod;
    }

    const res = await fetch(`${whopHosts(environment).api}/plans`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (res.ok) {
      const data = (await res.json()) as { id: string };
      return data.id;
    }
    const err = await res.text().catch(() => "");
    console.error(`[Whop API] Create plan failed: ${err.slice(0, 200)}`);
    return null;
  } catch (err) {
    console.error(`[Whop API] Create plan error: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Interactive plan setup
// ---------------------------------------------------------------------------

/**
 * Guide user through plan creation and create products/plans via Whop API.
 */
export async function setupPlans(
  apiKey: string,
  companyId: string,
  environment: WhopEnvironment = "production",
): Promise<PlanSetupResult | null> {

  // How many paid tiers?
  const tierCount = await p.select({
    message: "How many paid tiers?",
    options: [
      { value: 1, label: "1 tier", hint: "e.g. Pro" },
      { value: 2, label: "2 tiers", hint: "e.g. Starter + Pro" },
      { value: 3, label: "3 tiers", hint: "e.g. Starter + Pro + Enterprise" },
      { value: 4, label: "4 tiers", hint: "e.g. Basic + Starter + Pro + Enterprise" },
    ],
  });
  if (p.isCancel(tierCount)) return null;

  // Include free tier?
  const includeFree = await p.confirm({
    message: "Include a free tier?",
    initialValue: true,
  });
  if (p.isCancel(includeFree)) return null;

  // Billing intervals
  const billingChoice = await p.select({
    message: "Billing intervals?",
    options: [
      { value: "both", label: "Monthly + Yearly", hint: "most common" },
      { value: "monthly", label: "Monthly only" },
    ],
  });
  if (p.isCancel(billingChoice)) return null;
  const includeYearly = billingChoice === "both";

  // Default tier names based on count
  const defaultNames: Record<number, string[]> = {
    1: ["Pro"],
    2: ["Starter", "Pro"],
    3: ["Starter", "Pro", "Enterprise"],
    4: ["Basic", "Starter", "Pro", "Enterprise"],
  };
  const suggestedPrices: Record<string, string> = {
    Basic: "9",
    Starter: "29",
    Pro: "79",
    Enterprise: "199",
  };

  const suggestedNames = defaultNames[tierCount as number] || ["Pro"];

  // Collect name + pricing for each tier
  const tiers: PlanTier[] = [];
  for (let i = 0; i < (tierCount as number); i++) {
    const suggested = suggestedNames[i];
    const nameResult = await p.text({
      message: `Tier ${i + 1} name`,
      initialValue: suggested,
      validate: (v) => {
        if (!v?.trim()) return "Required";
        const key = tierKeyFromName(v);
        if (!TIER_KEY_RE.test(key)) {
          return "Name must contain letters (used for env vars and code identifiers)";
        }
        if (key === "free") return `"Free" is reserved for the built-in free tier`;
        if (tiers.some((t) => t.key === key)) return "A tier with this name already exists";
      },
    });
    if (p.isCancel(nameResult)) return null;
    const name = nameResult.trim();

    const monthlyPrice = await p.text({
      message: `${name} — monthly price ($)`,
      placeholder: suggestedPrices[suggested] ?? "49",
      validate: (v) => {
        if (!v) return "Required";
        const n = parseFloat(v);
        if (isNaN(n) || n < 0) return "Must be a valid number";
      },
    });
    if (p.isCancel(monthlyPrice)) return null;

    let yearlyPrice = "";
    if (includeYearly) {
      const monthly = parseFloat(monthlyPrice);
      const suggestedYearly = Math.round(monthly * 10); // ~17% discount
      yearlyPrice = (await p.text({
        message: `${name} — yearly price ($)`,
        placeholder: String(suggestedYearly),
        validate: (v) => {
          if (!v) return "Required";
          const n = parseFloat(v);
          if (isNaN(n) || n < 0) return "Must be a valid number";
        },
      })) as string;
      if (p.isCancel(yearlyPrice)) return null;
    }

    tiers.push({
      key: tierKeyFromName(name),
      name,
      monthlyPrice: parseFloat(monthlyPrice),
      yearlyPrice: yearlyPrice ? parseFloat(yearlyPrice) : 0,
    });
  }

  // Confirm before creating
  p.log.info("");
  p.log.info(pc.bold("Plan summary:"));
  if (includeFree) p.log.info(`  ${pc.dim("Free")} — $0`);
  for (const tier of tiers) {
    const yearly = includeYearly ? ` / $${tier.yearlyPrice}/yr` : "";
    p.log.info(`  ${pc.bold(tier.name)} — $${tier.monthlyPrice}/mo${yearly}`);
  }
  p.log.info("");

  const confirm = await p.confirm({
    message: "Create these plans on Whop?",
    initialValue: true,
  });
  if (p.isCancel(confirm) || !confirm) return null;

  // ── Create everything on Whop ──────────────────────────────────
  const created: CreatedPlan[] = [];
  let freePlanId: string | null = null;

  // Create free tier product + plan if needed
  if (includeFree) {
    const s = p.spinner();
    s.start("Creating Free tier...");
    const productId = await createProduct(apiKey, companyId, "Free", environment);
    if (productId) {
      const planId = await createPlan(apiKey, companyId, productId, 0, 0, environment);
      if (planId) {
        freePlanId = planId;
        s.stop(`Free tier created: ${pc.dim(planId)}`);
      } else {
        s.stop("Failed to create Free plan");
      }
    } else {
      s.stop("Failed to create Free product");
    }
  }

  // Create paid tiers
  for (const tier of tiers) {
    const s = p.spinner();
    s.start(`Creating ${tier.name} tier...`);

    const productId = await createProduct(apiKey, companyId, tier.name, environment);
    if (!productId) {
      s.stop(`Failed to create ${tier.name} product`);
      continue;
    }

    // Monthly + yearly plans are independent — create them concurrently
    const [monthlyPlanId, yearlyPlanId] = await Promise.all([
      createPlan(apiKey, companyId, productId, tier.monthlyPrice, 30, environment),
      includeYearly && tier.yearlyPrice > 0
        ? createPlan(apiKey, companyId, productId, tier.yearlyPrice, 365, environment)
        : Promise.resolve(null),
    ]);
    if (!monthlyPlanId) {
      s.stop(`Failed to create ${tier.name} monthly plan`);
      continue;
    }

    s.stop(`${tier.name}: ${pc.dim(monthlyPlanId)}${yearlyPlanId ? ` + ${pc.dim(yearlyPlanId)}` : ""}`);

    created.push({
      key: tier.key,
      name: tier.name,
      productId,
      monthlyPlanId,
      yearlyPlanId,
      monthlyPrice: tier.monthlyPrice,
      yearlyPrice: tier.yearlyPrice,
    });
  }

  return { tiers: created, includeFree, freePlanId, includeYearly };
}

/**
 * Convert plan setup result to environment variables for the template.
 * Next.js uses NEXT_PUBLIC_ prefix; others use plain WHOP_ prefix.
 */
export function planResultToEnvVars(result: PlanSetupResult, framework = "nextjs"): Record<string, string> {
  const vars: Record<string, string> = {};
  const prefix = framework === "nextjs" ? "NEXT_PUBLIC_WHOP_" : "WHOP_";

  if (result.freePlanId) {
    vars[`${prefix}FREE_PLAN_ID`] = result.freePlanId;
  }

  for (const tier of result.tiers) {
    const KEY = tier.key.toUpperCase();
    vars[`${prefix}${KEY}_PLAN_ID`] = tier.monthlyPlanId;
    if (tier.yearlyPlanId) {
      vars[`${prefix}${KEY}_PLAN_ID_YEARLY`] = tier.yearlyPlanId;
    }
  }

  return vars;
}

/**
 * Rewrite the project's definePlans() block to match the tiers that were
 * just created on Whop, so the template's plan structure (pricing page,
 * env var names, setup wizard, gating) lines up with reality instead of
 * assuming the default free/starter/pro layout.
 */
export function applyPlanCodegen(projectDir: string, result: PlanSetupResult): RewriteResult {
  const supportsHidden = projectSupportsHiddenFlag(projectDir);
  const plansObject = generatePlansObject({
    tiers: result.tiers.map(({ key, name, monthlyPrice, yearlyPrice }) => ({
      key,
      name,
      monthlyPrice,
      yearlyPrice,
    })),
    includeFree: result.includeFree,
    includeYearly: result.includeYearly,
    supportsHidden,
  });

  const res = rewriteDefinePlans(projectDir, plansObject);
  if (res.ok) {
    p.log.success(`Updated definePlans() in ${pc.bold(res.file!)} to match your tiers`);
    if (!result.includeFree && !supportsHidden) {
      p.log.info(
        pc.dim(
          "Free tier stays visible on pricing — hiding it needs whop-kit >= 0.3.1 (npx whop-kit upgrade)",
        ),
      );
    }
    p.log.info(pc.dim(`Tier descriptions and features are placeholders — edit ${res.file}`));
  } else {
    p.log.warning(`Couldn't update plan definitions automatically (${res.reason}).`);
    p.log.info(
      pc.dim("If your template defines plans, edit its definePlans() call to match your tiers."),
    );
  }
  return res;
}
