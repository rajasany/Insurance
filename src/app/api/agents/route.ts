/*
Comment
*/ 
import { NextResponse } from "next/server";
import { agentRoster, buildStages } from "@/lib/agents/orchestrator";
import { getLlmProvider } from "@/lib/agents/llm";

export const runtime = "nodejs";

export async function GET() {
  const provider = getLlmProvider();
  return NextResponse.json({
    agents: agentRoster(),
    // The execution plan is derived from the agents' declared dependencies, so
    // the UI renders the real coordination graph rather than a hardcoded one.
    stages: buildStages().map((stage) => stage.map((a) => a.id)),
    provider: { kind: provider.kind, model: provider.model },
  });
}
