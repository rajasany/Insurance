/**
 * CLI evaluation run: `npm run eval`
 *
 * Uses the deterministic provider unless UNDERWRITING_LLM=claude, so the
 * numbers are reproducible by default. Exits non-zero when a target is missed,
 * which makes it usable as a CI gate.
 */
/* 
A new comment
*/
import { ClaudeLlmProvider, MockLlmProvider, type LlmProvider } from "../src/lib/agents/llm";
import { runEvaluation } from "../src/lib/eval/harness";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function pad(s: string, width: number): string {
  return s.length >= width ? s.slice(0, width) : s + " ".repeat(width - s.length);
}

async function main(): Promise<void> {
  const useClaude = (process.env.UNDERWRITING_LLM ?? "").toLowerCase() === "claude";
  const llm: LlmProvider = useClaude ? new ClaudeLlmProvider() : new MockLlmProvider();

  const report = await runEvaluation(llm);

  console.log(`\nProvider: ${report.provider.kind} (${report.provider.model})`);
  console.log(`Cases:    ${report.cases.length}\n`);

  console.log(
    pad("SUBMISSION", 12) +
      pad("LINE", 10) +
      pad("SCORE", 7) +
      pad("EXPECTED", 10) +
      pad("ACTUAL", 10) +
      pad("TOP PRODUCT", 14) +
      "OK",
  );
  console.log("-".repeat(76));
  for (const c of report.cases) {
    console.log(
      pad(c.applicationId, 12) +
        pad(c.line, 10) +
        pad(String(c.riskScore), 7) +
        pad(c.expectedOutcome, 10) +
        pad(c.actualOutcome, 10) +
        pad(c.actualTopProduct ?? "—", 14) +
        (c.accurate ? "✓" : "✗"),
    );
    for (const note of c.notes) console.log(`             ↳ ${note}`);
  }

  console.log("\n--- Success metrics ---");
  console.log(
    `Recommendation accuracy (decision + product): ${pct(report.recommendationAccuracy)}  target ${pct(
      report.targets.recommendationAccuracy,
    )}  ${report.meetsAccuracyTarget ? "✓" : "✗"}`,
  );
  console.log(
    `Underwriting time reduction:                  ${pct(report.underwritingTimeReduction)}  target ${pct(
      report.targets.underwritingTimeReduction,
    )}  ${report.meetsTimeTarget ? "✓" : "✗"}`,
  );

  console.log("\n--- Components ---");
  console.log(`Decision accuracy:   ${pct(report.decisionAccuracy)}`);
  console.log(`Product accuracy:    ${pct(report.productAccuracy)}`);
  console.log(`Risk-band accuracy:  ${pct(report.riskBandAccuracy)}`);
  console.log(`Straight-through:    ${pct(report.straightThroughRate)}`);
  console.log(`Waterfall integrity: ${pct(report.waterfallIntegrity)}`);
  console.log(`Compliance pass:     ${pct(report.compliancePassRate)}`);
  console.log(
    `Cycle time:          ${report.baselineTotalMinutes} min baseline → ${report.assistedTotalMinutes} min assisted`,
  );

  console.log("\n--- Caveats ---");
  for (const caveat of report.caveats) console.log(`• ${caveat}`);
  console.log();

  if (!report.meetsAccuracyTarget || !report.meetsTimeTarget) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
