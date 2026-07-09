// Shared types for the Business OS core communication layer.
// Every agent (hr, sales, operations, compliance, finance, marketing, design)
// imports from here so requests, responses, and inter-agent messages stay
// consistent regardless of which tenant/business is calling them.

export type AgentName =
  | "hr"
  | "sales"
  | "operations"
  | "compliance"
  | "finance"
  | "marketing"
  | "design";

/** Identifies which business (tenant) an incoming request belongs to. */
export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  displayName: string;
}

/** Standard envelope every agent Edge Function expects on invocation. */
export interface AgentRequest<TPayload = unknown> {
  tenant: TenantContext;
  action: string;
  payload: TPayload;
  /** Set when this call is itself the result of one agent invoking another. */
  correlationId?: string;
}

/** Standard envelope every agent Edge Function returns. */
export interface AgentResponse<TResult = unknown> {
  ok: boolean;
  agent: AgentName;
  action: string;
  result?: TResult;
  error?: string;
}

/** Message shape used when one agent invokes another via the bus. */
export interface AgentMessage<TPayload = unknown> {
  from: AgentName;
  to: AgentName;
  tenant: TenantContext;
  action: string;
  payload: TPayload;
  correlationId: string;
}
