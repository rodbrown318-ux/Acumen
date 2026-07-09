// Marketing Funnels capability module.
//
// This lives inside the marketing agent (not as its own Edge Function) —
// funnel design, sequencing, and campaign automation are marketing
// activities that share the marketing agent's context and config. Keeping
// it as a module rather than a separate agent avoids two agents needing to
// negotiate ownership of the same campaign state.

export async function buildFunnel(payload: unknown) {
  return { status: "not_implemented", payload };
}

export async function getFunnelPerformance(payload: unknown) {
  return { status: "not_implemented", payload };
}
