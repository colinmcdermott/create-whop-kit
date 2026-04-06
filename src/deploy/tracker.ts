import * as p from "@clack/prompts";
import pc from "picocolors";

export interface Step {
  name: string;
  status: "success" | "failed" | "skipped";
  detail?: string;      // e.g. the URL or ID
  recovery?: string;    // what to do if it failed
}

export class StepTracker {
  private steps: Step[] = [];

  success(name: string, detail?: string) {
    this.steps.push({ name, status: "success", detail });
  }

  failed(name: string, recovery: string) {
    this.steps.push({ name, status: "failed", recovery });
  }

  skipped(name: string) {
    this.steps.push({ name, status: "skipped" });
  }

  get hasFailures(): boolean {
    return this.steps.some((s) => s.status === "failed");
  }

  get allSucceeded(): boolean {
    return this.steps.every((s) => s.status !== "failed");
  }

  /**
   * Render the summary as a formatted string for p.note()
   */
  render(extras?: { productionUrl?: string; githubUrl?: string }): string {
    const lines: string[] = [];

    for (const step of this.steps) {
      if (step.status === "success") {
        const detail = step.detail ? ` ${pc.dim(step.detail)}` : "";
        lines.push(`${pc.green("✓")} ${step.name}${detail}`);
      } else if (step.status === "failed") {
        lines.push(`${pc.red("✗")} ${step.name}`);
        if (step.recovery) {
          lines.push(`  ${pc.dim("→")} ${pc.dim(step.recovery)}`);
        }
      } else {
        lines.push(`${pc.dim("○")} ${step.name} ${pc.dim("(skipped)")}`);
      }
    }

    if (extras?.productionUrl || extras?.githubUrl) {
      lines.push("");
      if (extras.productionUrl) {
        lines.push(`  ${pc.bold("Production:")} ${pc.cyan(extras.productionUrl)}`);
      }
      if (extras.githubUrl) {
        lines.push(`  ${pc.bold("GitHub:")}     ${pc.dim(extras.githubUrl)}`);
      }
    }

    return lines.join("\n");
  }
}
