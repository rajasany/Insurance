import Anthropic from "@anthropic-ai/sdk";
import type { AgentId } from "@/lib/domain/types";

/**
 * LLM access for the agents.
 *
 * Two design rules hold everywhere in this layer:
 *
 * 1. **The model never produces a number the business relies on.** Risk scores,
 *    premiums, eligibility, and rule outcomes all come from the deterministic
 *    engine. The model reads those and produces judgment and prose. That is why
 *    the evaluation harness can reproduce results run over run.
 *
 * 2. **Every call has a deterministic fallback.** If there is no API key, or the
 *    call errors, or safety classifiers decline it, the agent still returns a
 *    usable result built from engine output. The app degrades in quality, never
 *    in function.
 */

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Structured-output schema. `additionalProperties: false` and a complete
 * `required` list are mandatory for strict JSON output — without them the
 * response is not actually constrained.
 *
 * The index signature is what lets these literals satisfy the SDK's schema
 * parameter type.
 */
export interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
  [key: string]: unknown;
}

export interface LlmRequest<T> {
  agent: AgentId;
  system: string;
  prompt: string;
  schema: JsonSchema;
  /**
   * Deterministic result used when the model is unavailable, errors, or is
   * declined. Also the mock provider's entire implementation.
   */
  fallback: () => T;
  /**
   * Tuned per agent: narration work runs at `medium`, judgment work at `high`.
   * Sweep these against your own eval set before changing them — on Opus 5 the
   * lower levels perform better than their name suggests.
   */
  effort?: Effort;
  maxTokens?: number;
}

export interface LlmResult<T> {
  value: T;
  usedMock: boolean;
  tokensIn?: number;
  tokensOut?: number;
  /** Set when the model was attempted but we fell back. */
  degradedReason?: string;
}

export interface LlmProvider {
  readonly kind: "claude" | "mock";
  readonly model: string;
  complete<T>(request: LlmRequest<T>): Promise<LlmResult<T>>;
}

// ---------------------------------------------------------------------------
// Mock provider
// ---------------------------------------------------------------------------

/**
 * Returns the deterministic fallback for every call. This is what makes the
 * app runnable with no credentials and what the eval harness uses by default,
 * so accuracy numbers measure the engine rather than model sampling noise.
 */
export class MockLlmProvider implements LlmProvider {
  readonly kind = "mock" as const;
  readonly model = "deterministic-engine";

  async complete<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
    return { value: request.fallback(), usedMock: true };
  }
}

// ---------------------------------------------------------------------------
// Claude provider
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = process.env.UNDERWRITING_MODEL ?? "claude-opus-5";

export class ClaudeLlmProvider implements LlmProvider {
  readonly kind = "claude" as const;
  readonly model: string;
  private client: Anthropic;

  constructor(model = DEFAULT_MODEL) {
    this.model = model;
    this.client = new Anthropic();
  }

  async complete<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
    try {
      // Streaming keeps long generations off the request-timeout cliff.
      const stream = this.client.beta.messages.stream({
        model: this.model,
        max_tokens: request.maxTokens ?? 8000,
        // Adaptive thinking is on by default on Opus 5; `effort` is the depth
        // control. No sampling parameters — they are rejected on this model.
        output_config: {
          effort: request.effort ?? "medium",
          format: { type: "json_schema", schema: request.schema },
        },
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
        // Safety classifiers can decline a request outright. Server-side
        // fallbacks re-serve it on Anthropic's recommended substitute instead of
        // handing us a dead turn. `"default"` routes by refusal category, so
        // there is no fallback model list to maintain here.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      const message = await stream.finalMessage();

      if (message.stop_reason === "refusal") {
        return {
          value: request.fallback(),
          usedMock: true,
          degradedReason: `Model declined the request (${message.stop_details?.category ?? "unspecified"}); used deterministic output.`,
        };
      }

      const text = message.content.find((b) => b.type === "text");
      if (!text || text.type !== "text") {
        return {
          value: request.fallback(),
          usedMock: true,
          degradedReason: "Model returned no text block; used deterministic output.",
        };
      }

      return {
        value: JSON.parse(text.text) as T,
        usedMock: false,
        tokensIn: message.usage.input_tokens,
        tokensOut: message.usage.output_tokens,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        value: request.fallback(),
        usedMock: true,
        degradedReason: `LLM call failed (${detail}); used deterministic output.`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

let cached: LlmProvider | null = null;

/**
 * `UNDERWRITING_LLM` forces a provider: `claude`, `mock`, or `auto` (default —
 * Claude when a credential is present, mock otherwise).
 */
export function getLlmProvider(): LlmProvider {
  if (cached) return cached;

  const mode = (process.env.UNDERWRITING_LLM ?? "auto").toLowerCase();
  if (mode === "mock") {
    cached = new MockLlmProvider();
    return cached;
  }

  const hasCredential = Boolean(
    process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
  );

  if (mode === "claude" || hasCredential) {
    try {
      cached = new ClaudeLlmProvider();
      return cached;
    } catch {
      // No resolvable credential — fall through rather than failing the request.
    }
  }

  cached = new MockLlmProvider();
  return cached;
}

export function resetLlmProvider(): void {
  cached = null;
}
