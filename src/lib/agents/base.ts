import type { AgentId, UnderwritingCase } from "@/lib/domain/types";
import type { LlmProvider } from "./llm";

export interface AgentContext {
  llm: LlmProvider;
  /** Streams a line to the coordination timeline. */
  log: (message: string) => void;
}

export interface AgentOutput {
  patch: Partial<UnderwritingCase>;
  /** True when the deterministic fallback stood in for the model. */
  usedMockLlm: boolean;
  tokensIn?: number;
  tokensOut?: number;
}

export interface Agent {
  readonly id: AgentId;
  readonly label: string;
  readonly description: string;
  /** Agents whose output this one reads. Drives the coordination graph. */
  readonly consumes: AgentId[];
  run(current: UnderwritingCase, ctx: AgentContext): Promise<AgentOutput>;
}

/** Shared preamble. Kept short — Opus 5 follows instructions literally. */
export const SHARED_SYSTEM = `You are one agent in an insurance underwriting system.

The numbers are not yours to produce. Risk scores, premiums, product eligibility, and rule outcomes are computed by a deterministic rating and rules engine and given to you as input. Your job is judgment and language: read what the engine produced and explain it, or make the specific call you are asked to make.

Never restate a number you were not given. Never contradict an engine output — if you think it is wrong, say so explicitly in the field provided rather than silently substituting your own value.

Write for a working underwriter or a licensed agent talking to a customer: specific, plain, and free of hedging. Cite the evidence you were given rather than gesturing at it.`;
