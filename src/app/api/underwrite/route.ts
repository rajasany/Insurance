import { runUnderwriting } from "@/lib/agents/orchestrator";
import type { OrchestratorEvent } from "@/lib/domain/types";

export const runtime = "nodejs";
// Agent runs are per-submission and never cacheable.
export const dynamic = "force-dynamic";

/**
 * Server-sent event stream for one underwriting run.
 *
 * The orchestrator emits coordination events synchronously as agents start,
 * log, and finish; this handler forwards each one as it happens so the timeline
 * in the UI reflects real concurrency instead of a replayed animation.
 */
export async function GET(request: Request): Promise<Response> {
  const applicationId = new URL(request.url).searchParams.get("applicationId");
  if (!applicationId) {
    return new Response(JSON.stringify({ error: "applicationId is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: OrchestratorEvent | { type: "error"; message: string }) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      // A client navigating away mid-run should stop the writes, not throw.
      request.signal.addEventListener("abort", () => {
        closed = true;
      });

      try {
        const result = await runUnderwriting(applicationId, { onEvent: send });
        // The terminal event carries the assembled case so the client does not
        // have to reconstruct it from the incremental patches.
        send({
          type: "case_updated",
          patch: result.case,
          at: Date.now(),
        });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (!closed) {
          try {
            controller.close();
          } catch {
            /* already closed by the client */
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Prevents proxy buffering, which would batch the timeline into one burst.
      "x-accel-buffering": "no",
    },
  });
}
