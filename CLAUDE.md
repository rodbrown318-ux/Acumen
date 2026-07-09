# Business OS

A reusable, multi-tenant AI business operating system. A single set of AI
agents — HR, Sales, Operations, Compliance, Finance, Marketing, Design —
runs as Supabase Edge Functions and can be plugged into any business
without forking the agent code. The first business running on it is
**Complete Staffing**.

> **Naming note:** Marketing Funnels is a capability inside the Marketing
> agent (`supabase/functions/marketing/funnels.ts`), not a separate Edge
> Function — this is confirmed, giving exactly 7 standalone agents.

## Architecture at a glance

```
Business (tenant) ──x-tenant-slug header──▶  Agent Edge Function
                                                  │
                                    ┌─────────────┴─────────────┐
                                    │   supabase/functions/_shared  │  core communication layer
                                    │   (types, auth, bus, client,  │  — every agent imports this,
                                    │    logger, cors, handler)     │    agents never import each other
                                    └─────────────┬─────────────┘
                                                  │
                       ┌───────────┬───────────┬─┴─────┬───────────┬───────────┬───────────┐
                      hr        sales      operations compliance finance   marketing     design
                                                                          (+ funnels
                                                                           submodule)
```

Business-specific behavior (a tenant's onboarding checklist, tracked
compliance credentials, brand voice, etc.) never lives in agent code — it
lives in that tenant's folder under `integrations/`, keyed by tenant slug.
This is what makes the same 7 agents reusable across unrelated businesses.

## Directory structure

```
supabase/
  config.toml                    # local dev config; one entry per agent function
  migrations/
    20260709000000_tenants.sql   # shared `tenants` table every agent resolves against
  functions/
    _shared/                     # the core communication layer (see below)
      types.ts                   # AgentRequest / AgentResponse / TenantContext / AgentMessage
      client.ts                  # service-role Supabase client factory
      auth.ts                    # resolves x-tenant-slug -> TenantContext
      bus.ts                     # callAgent() — how one agent invokes another
      logger.ts                  # structured JSON logging, tagged by agent name
      cors.ts                    # shared CORS headers + OPTIONS preflight
      handler.ts                 # createAgentHandler() — wraps an agent's
                                  #   action map with CORS/auth/logging/response
                                  #   boilerplate so agent code only defines actions
    hr/index.ts                  # HR agent
    sales/index.ts                # Sales agent
    operations/index.ts           # Operations agent
    compliance/index.ts           # Compliance agent
    finance/index.ts              # Finance agent
    marketing/
      index.ts                    # Marketing agent
      funnels.ts                  # Marketing Funnels capability (see naming note above)
    design/index.ts               # Design agent

integrations/
  complete-staffing/              # first business integration
    tenant.json                   # tenant identity + which agents are enabled
    hr.config.json                # example: business-specific agent config
    compliance.config.json        # example: business-specific agent config
    README.md
```

## The core communication layer (`supabase/functions/_shared`)

Agents are **standalone** Edge Functions — they don't import each other's
code. Everything they share lives in `_shared` (the Supabase CLI convention
for code that's bundled into every function but never deployed as its own
endpoint):

- **`types.ts`** — the contract every agent speaks: `AgentRequest`,
  `AgentResponse`, `TenantContext`, `AgentMessage`.
- **`handler.ts`** — `createAgentHandler(agentName, actions)` is what an
  agent's `index.ts` calls. It resolves the tenant, dispatches to the right
  action, logs the call, and returns a consistent `AgentResponse` envelope
  (or a structured error) — so adding a new agent means writing action
  functions, not re-implementing request plumbing.
- **`auth.ts`** — reads the `x-tenant-slug` header and resolves it against
  the shared `tenants` table to produce a `TenantContext`. This is the only
  place tenant identity is resolved.
- **`bus.ts`** — `callAgent(from, to, tenant, action, payload)` is how one
  agent invokes another (e.g. Sales asking Finance to draft an invoice). It
  calls the target agent's own HTTP endpoint with the service-role key, so
  an inter-agent call goes through the exact same auth/logging path as an
  external caller.
- **`client.ts`** — one service-role Supabase client factory, reused by
  every agent.
- **`logger.ts`** — structured JSON logs tagged with agent name, so
  Supabase's log explorer can be filtered/correlated by agent and by
  `correlationId` across an inter-agent call chain.
- **`cors.ts`** — shared CORS headers and OPTIONS preflight handling.

## Multi-tenancy: how a business plugs in

1. Add a row to the shared `tenants` table (`slug`, `display_name`) — see
   `supabase/migrations/20260709000000_tenants.sql` for the table and how
   Complete Staffing was seeded.
2. Create `integrations/<business-slug>/` with a `tenant.json` declaring
   which of the 7 agents are enabled, plus one `<agent>.config.json` per
   agent that needs business-specific behavior.
3. Callers (the business's own frontend, workflow automation, etc.) send
   requests to an agent's Edge Function URL with an `x-tenant-slug` header
   set to the business's slug. No agent code changes, no redeploy.

**Complete Staffing** (`integrations/complete-staffing/`) is the reference
integration — a staffing agency that places W-2 employees at client sites.
Its `hr.config.json` and `compliance.config.json` show the pattern (e.g.
tracking compliance credentials per employee-client pair, not just per
employee); follow the same shape for the remaining agents and for the next
business onboarded.

## Request/response contract

Every agent receives:
```json
{ "action": "someAction", "payload": { ... }, "correlationId": "optional" }
```
with `x-tenant-slug: <business-slug>` as a header, and returns:
```json
{ "ok": true, "agent": "hr", "action": "someAction", "result": { ... } }
```
or, on failure, `{ "ok": false, "agent": "hr", "action": "unknown", "error": "..." }`.

## Adding a new agent

1. `mkdir supabase/functions/<agent-name>` and add `index.ts` that calls
   `createAgentHandler("<agent-name>", { actionName: handlerFn, ... })`
   from `_shared/handler.ts`, following any existing agent as a template.
2. Add `[functions.<agent-name>]` to `supabase/config.toml`.
3. Add it to `AgentName` in `_shared/types.ts`.

## Adding a new business

1. Insert its row into `tenants`.
2. Create `integrations/<new-business-slug>/tenant.json` + per-agent config
   as needed, mirroring `integrations/complete-staffing/`.
3. Point the business's callers at the agent Edge Functions with its
   `x-tenant-slug`. No agent code or deploy changes required.

## Runtime notes

- Agents run on Deno (Supabase Edge Functions runtime), not Node — imports
  use `jsr:`/`npm:`/`https:` specifiers, not a `package.json`.
- `verify_jwt = false` in `config.toml` for every agent: tenant identity is
  resolved via `x-tenant-slug` + the `tenants` table, and the service-role
  key gates inter-agent calls. Before exposing any agent to a public
  frontend directly, add real end-user auth (Supabase Auth JWT) on top of
  this — the current scaffold assumes trusted server-to-server callers.
- Every agent index.ts currently only implements a `ping` action as a
  placeholder — replace with real domain actions per agent.
