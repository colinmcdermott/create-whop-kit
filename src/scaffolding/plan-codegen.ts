import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// definePlans() codegen — keeps the template's plan structure in sync with
// the tiers actually created on Whop during deploy / `add plans`.
//
// The templates declare their tier structure statically in a constants file:
//
//   export const plans = definePlans({ free: {...}, starter: {...} });
//
// Everything else in the template (env var names, config keys, pricing page,
// setup wizard, gating) derives from that object. The CLI creates tiers
// interactively, so unless this block is rewritten to match, users who pick
// anything other than the template's default structure end up with orphaned
// env vars or unconfigured placeholder tiers.
// ---------------------------------------------------------------------------

export interface GeneratedTier {
  key: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
}

export interface PlanGenOptions {
  tiers: GeneratedTier[];
  /** Whether the user wants a visible free tier on the pricing page */
  includeFree: boolean;
  /** Whether yearly billing plans were created */
  includeYearly: boolean;
  /**
   * Whether the project's installed whop-kit supports the `hidden` metadata
   * flag (>= 0.3.1). When false and includeFree is false, the free tier is
   * generated visible rather than emitting a field that would fail typecheck.
   */
  supportsHidden: boolean;
}

/** Files we look in for the definePlans() block, relative to project root. */
const CONSTANTS_CANDIDATES = [
  "lib/constants.ts", // Next.js template
  "src/lib/constants.ts", // Astro / TanStack templates
  "app/lib/constants.ts",
  "src/constants.ts",
];

// Placeholder feature lists — users are expected to replace these.
const FREE_FEATURES = ["Basic features", "Community support"];
function paidFeatures(index: number, tiers: GeneratedTier[]): string[] {
  if (index === 0) {
    return ["All core features", "Email support", "Regular updates"];
  }
  return [
    `Everything in ${tiers[index - 1].name}`,
    "Priority support",
    "Advanced features",
  ];
}

function quote(s: string): string {
  return JSON.stringify(s);
}

/**
 * Generate the object-literal argument for definePlans() matching the tiers
 * the user created. A `free` key always comes first: it's the default plan —
 * the state users land on after OAuth sign-in and the downgrade target when
 * a membership is deactivated — even when no free tier is advertised.
 */
export function generatePlansObject(opts: PlanGenOptions): string {
  const { tiers, includeFree, includeYearly, supportsHidden } = opts;
  const highlightIndex = Math.min(Math.floor(tiers.length / 2), tiers.length - 1);
  const lines: string[] = ["{"];

  // Free tier (always present as the unpaid landing state)
  lines.push("  free: {");
  lines.push(`    name: "Free",`);
  lines.push(`    description: "Get started with the basics",`);
  lines.push("    priceMonthly: 0,");
  lines.push("    priceYearly: 0,");
  lines.push("    features: [");
  for (const f of FREE_FEATURES) lines.push(`      ${quote(f)},`);
  lines.push("    ],");
  lines.push("    highlighted: false,");
  if (!includeFree && supportsHidden) {
    lines.push("    // Not advertised on pricing pages, but kept as the unpaid");
    lines.push("    // landing state and membership-deactivation downgrade target.");
    lines.push("    hidden: true,");
  }
  lines.push("  },");

  tiers.forEach((tier, i) => {
    lines.push(`  ${tier.key}: {`);
    lines.push(`    name: ${quote(tier.name)},`);
    lines.push(`    description: "TODO: describe this tier",`);
    lines.push(`    priceMonthly: ${tier.monthlyPrice}, // Synced from Whop API at runtime`);
    lines.push(`    priceYearly: ${includeYearly ? tier.yearlyPrice : 0},`);
    lines.push("    features: [");
    lines.push("      // TODO: replace with your real features");
    for (const f of paidFeatures(i, tiers)) lines.push(`      ${quote(f)},`);
    lines.push("    ],");
    lines.push(`    highlighted: ${i === highlightIndex},`);
    if (!includeYearly) {
      lines.push(`    billingIntervals: ["monthly"],`);
    }
    lines.push("  },");
  });

  lines.push("}");
  return lines.join("\n");
}

export interface RewriteResult {
  ok: boolean;
  /** Project-relative path of the file that was rewritten */
  file?: string;
  reason?: string;
}

/**
 * Replace the first definePlans({...}) argument in the project's constants
 * file with a freshly generated object. Uses brace-balanced scanning rather
 * than markers so it works on any template version, and skips gracefully
 * (ok: false + reason) when no definePlans() call exists — e.g. the blank
 * template or a heavily customized project.
 */
export function rewriteDefinePlans(projectDir: string, plansObject: string): RewriteResult {
  const relPath = CONSTANTS_CANDIDATES.find((rel) => {
    const abs = join(projectDir, rel);
    return existsSync(abs) && readFileSync(abs, "utf-8").includes("definePlans(");
  });
  if (!relPath) {
    return { ok: false, reason: "no definePlans() call found in known constants files" };
  }

  const abs = join(projectDir, relPath);
  const source = readFileSync(abs, "utf-8");
  const callStart = source.indexOf("definePlans(");
  const argStart = source.indexOf("{", callStart);
  if (argStart === -1) {
    return { ok: false, reason: "definePlans() call has no object argument" };
  }

  // Scan for the matching closing brace. The template's plan block is plain
  // data (strings, numbers, arrays), so tracking string literals plus brace
  // depth is sufficient — no comments or template literals appear inside.
  let depth = 0;
  let inString: '"' | "'" | null = null;
  let argEnd = -1;
  for (let i = argStart; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'") inString = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        argEnd = i;
        break;
      }
    }
  }
  if (argEnd === -1) {
    return { ok: false, reason: "could not find end of definePlans() argument" };
  }

  const updated = source.slice(0, argStart) + plansObject + source.slice(argEnd + 1);
  writeFileSync(abs, updated);
  return { ok: true, file: relPath };
}

/**
 * Whether the project's installed whop-kit supports the `hidden` plan flag
 * (added in 0.3.1). Reads the installed package rather than the declared
 * range so `add plans` on an older project degrades safely.
 */
export function projectSupportsHiddenFlag(projectDir: string): boolean {
  try {
    const pkgPath = join(projectDir, "node_modules", "whop-kit", "package.json");
    if (!existsSync(pkgPath)) return false;
    const { version } = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
    if (!version) return false;
    const [major, minor, patch] = version.split(".").map((n) => parseInt(n, 10));
    if ([major, minor, patch].some(Number.isNaN)) return false;
    return major > 0 || minor > 3 || (minor === 3 && patch >= 1);
  } catch {
    return false;
  }
}
