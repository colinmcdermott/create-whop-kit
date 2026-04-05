import * as p from "@clack/prompts";
import pc from "picocolors";
import { exec } from "../utils/exec.js";

const WHOP_API = "https://api.whop.com/api/v1";

function headers(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

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
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function createProduct(
  apiKey: string,
  companyId: string,
  title: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${WHOP_API}/products`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify({
        company_id: companyId,
        title,
        visibility: "visible",
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.id;
    }
    const err = await res.text().catch(() => "");
    console.error(`[Whop API] Create product failed: ${err}`);
    return null;
  } catch {
    return null;
  }
}

async function createPlan(
  apiKey: string,
  companyId: string,
  productId: string,
  price: number,
  billingPeriod: number, // 30 for monthly, 365 for yearly
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

    const res = await fetch(`${WHOP_API}/plans`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      return data.id;
    }
    const err = await res.text().catch(() => "");
    console.error(`[Whop API] Create plan failed: ${err}`);
    return null;
  } catch {
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
): Promise<PlanSetupResult | null> {

  // How many paid tiers?
  const tierCount = await p.select({
    message: "How many paid tiers?",
    options: [
      { value: 1, label: "1 tier", hint: "e.g. Pro" },
      { value: 2, label: "2 tiers", hint: "e.g. Starter + Pro" },
      { value: 3, label: "3 tiers", hint: "e.g. Starter + Pro + Enterprise" },
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
  };

  const tierNames = defaultNames[tierCount as number] || ["Pro"];

  // Collect pricing for each tier
  const tiers: PlanTier[] = [];
  for (const name of tierNames) {
    const monthlyPrice = await p.text({
      message: `${name} — monthly price ($)`,
      placeholder: name === "Starter" ? "29" : name === "Pro" ? "79" : "199",
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
      key: name.toLowerCase().replace(/\s+/g, "_"),
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
    const productId = await createProduct(apiKey, companyId, "Free");
    if (productId) {
      const planId = await createPlan(apiKey, companyId, productId, 0, 0);
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

    const productId = await createProduct(apiKey, companyId, tier.name);
    if (!productId) {
      s.stop(`Failed to create ${tier.name} product`);
      continue;
    }

    // Monthly plan
    const monthlyPlanId = await createPlan(apiKey, companyId, productId, tier.monthlyPrice, 30);
    if (!monthlyPlanId) {
      s.stop(`Failed to create ${tier.name} monthly plan`);
      continue;
    }

    // Yearly plan
    let yearlyPlanId: string | null = null;
    if (includeYearly && tier.yearlyPrice > 0) {
      yearlyPlanId = await createPlan(apiKey, companyId, productId, tier.yearlyPrice, 365);
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

  return { tiers: created, includeFree, freePlanId };
}

/**
 * Convert plan setup result to environment variables for the template.
 */
export function planResultToEnvVars(result: PlanSetupResult): Record<string, string> {
  const vars: Record<string, string> = {};

  if (result.freePlanId) {
    vars["NEXT_PUBLIC_WHOP_FREE_PLAN_ID"] = result.freePlanId;
  }

  for (const tier of result.tiers) {
    const KEY = tier.key.toUpperCase();
    vars[`NEXT_PUBLIC_WHOP_${KEY}_PLAN_ID`] = tier.monthlyPlanId;
    if (tier.yearlyPlanId) {
      vars[`NEXT_PUBLIC_WHOP_${KEY}_PLAN_ID_YEARLY`] = tier.yearlyPlanId;
    }
  }

  return vars;
}
