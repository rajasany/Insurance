import { NextResponse } from "next/server";
import { MockLlmProvider, getLlmProvider } from "@/lib/agents/llm";
import { runEvaluation, type EvalReport } from "@/lib/eval/harness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Runs the evaluation set and returns the success metrics.
 *
 * Defaults to the deterministic provider so a page refresh does not spend
 * tokens and so the number is reproducible. `?provider=claude` runs the full
 * stack including model narration — slower, and subject to sampling variance.
 */
let cached: { report: EvalReport; at: number; provider: string } | null = null;
const TTL_MS = 60_000;

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("provider") ?? "mock";
  const llm = requested === "claude" ? getLlmProvider() : new MockLlmProvider();

  if (cached && cached.provider === requested && Date.now() - cached.at < TTL_MS) {
    return NextResponse.json({ ...cached.report, cached: true });
  }

  const report = await runEvaluation(llm);
  cached = { report, at: Date.now(), provider: requested };

  return NextResponse.json({ ...report, cached: false });
}
