# Business OS

A reusable, multi-tenant AI business operating system. A single set of AI
agents — HR, Sales, Operations, Compliance, Finance, Marketing, Design —
runs as Supabase Edge Functions and can be plugged into any business
without forking the agent code. The first business running on it is
**Complete Staffing**.

> **Naming note:** Marketing Funnels is a capability inside the Marketing
> agent (`supabase/functions/marketing/funnels.ts`), not a separate Edge
> Function — this is confirmed, giving exactly 7 standalone agents.

## What "MCP-powered" means here

Each agent is more than a CRUD API: for decisions that require judgment
(which candidate is the best match, not just which ones are eligible), the
agent hands the decision to Claude via tool-calling rather than hand-coding
a scoring formula. The tools Claude is given are the same shape MCP tools
take — structured, typed, single-purpose actions — but they're wired up
through the Anthropic Messages API directly (`npm:@anthropic-ai/sdk`)
instead of the `@anthropic-ai/claude-agent-sdk` package or a literal MCP
server. That package assumes a long-lived Node/CLI process (it can shell
out to the Claude Code CLI); Supabase Edge Functions are stateless, sandboxed
Deno isolates invoked per-request with no subprocess support, so it can't
run there. See `supabase/functions/operations/agentClient.ts` for the
reference implementation of this pattern — every future agent that needs a
judgment call should follow the same shape.

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
    20260709000000_tenants.sql          # shared `tenants` table every agent resolves against
    20260709010000_operations_agent.sql # shifts/caregivers/offers/agent_decisions tables
    20260709020000_operations_agent_cron.sql # pg_cron: polls the Operations agent every 15 min
  functions/
    .env.example                 # every env var an agent deployment needs, documented
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
    operations/                   # Operations agent — see "Agent 1" section below
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
    operations.config.json        # documents this tenant's Operations agent config
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

## Agent 1: Operations (shift matching)

The Operations agent (`supabase/functions/operations/`) is the first agent
built out beyond the `ping` placeholder. It fills open shifts for a staffing
business end to end:

```
supabase/functions/operations/
  index.ts        # routes: POST {action} via createAgentHandler, plus a public
                   #   GET /respond?token=&decision= for caregiver email links
  poll.ts          # the 15-minute cycle: expire stale offers, match every open
                   #   shift, alert on anything unfilled inside the escalation window
  matching.ts       # per-shift: fetch candidates -> ask the agent -> send the offer
  agentClient.ts     # the Claude tool-calling step described above
  db.ts               # all Supabase queries (shifts, caregivers, offers, decisions)
  email.ts             # Resend integration: offer emails + escalation alerts
  respond.ts            # handles the public accept/decline link
  config.ts              # reads env vars into a single PollConfig
  types.ts                # Shift / Caregiver / ShiftOffer / CandidateCaregiver
```

**Flow:**
1. `pg_cron` (see `supabase/migrations/20260709020000_operations_agent_cron.sql`)
   POSTs `{"action": "pollShifts"}` to this function every 15 minutes, once
   per tenant, with that tenant's `x-tenant-slug` header.
2. `poll.ts` first expires any offer past its response window (default 30
   min, `OPERATIONS_OFFER_WINDOW_MINUTES`) and reopens that shift.
3. For every shift with `status = 'open'`, `db.ts` deterministically filters
   caregivers to those with a non-expired matching credential, availability
   covering the shift window, and no conflicting assignment or pending
   offer elsewhere. `agentClient.ts` then asks Claude to pick the best of
   that eligible set (fairness, credential margin, etc.) — a tie-break
   judgment call, not a lookup.
4. `email.ts` sends the chosen caregiver a Resend email with accept/decline
   links carrying a per-offer opaque token (`shift_offers.response_token`).
5. Clicking a link hits `GET /respond` (`respond.ts`) — public and
   unauthenticated, since the caller is an external caregiver, not a tenant
   system. Accept fills the shift; decline reopens it and immediately tries
   the next candidate rather than waiting for the next poll.
6. Each poll also alerts `OPERATIONS_ESCALATION_EMAIL` for any shift still
   open within `OPERATIONS_ESCALATION_HOURS` (default 4) of its start time.
   Escalating only records `escalated_at` — it does not stop the agent from
   still trying to fill the shift.
7. Every decision (offer sent, no candidates, no match, accepted, declined,
   expired, escalated, match error) is written to `agent_decisions` with a
   `reasoning` field when the agent supplied one — this is the audit trail.

**Data model** (`supabase/migrations/20260709010000_operations_agent.sql`):
`caregivers`, `caregiver_credentials`, `caregiver_availability`, `shifts`,
`shift_offers`, and the shared `agent_decisions` table every agent (not
just Operations) should log to. All are tenant-scoped and RLS-enabled with
no policies — only the service-role key (used exclusively server-side) can
read or write them.

**Config, per business** (`supabase/functions/.env.example`): `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`,
`RESEND_FROM_EMAIL`, `OPERATIONS_ESCALATION_EMAIL`,
`OPERATIONS_OFFER_WINDOW_MINUTES`, `OPERATIONS_ESCALATION_HOURS`. Onboarding
a new business's Operations agent means deploying this same code to that
business's own Supabase project and setting these secrets to its values —
no code changes. Complete Staffing's project ref
(`wcntkelmuxjczhyauupq`) and current config values are documented in
`integrations/complete-staffing/operations.config.json` (documentation
only — the function reads live env vars, not this file).

**Known limitations to close before relying on this in production:**
- Availability matching compares clock time in UTC (`db.ts`,
  `getCandidateCaregivers`); if shifts span multiple business timezones,
  add a timezone per tenant/site and convert before comparing.
- Availability is a single weekly recurring window per row — no support yet
  for one-off availability changes or time off.
- The migrations create tables and schedule the cron job but don't seed
  any `caregivers`/`shifts` data — that's real business data and has to
  come from Complete Staffing, not be fabricated by a migration.

## Runtime notes

- Agents run on Deno (Supabase Edge Functions runtime), not Node — imports
  use `jsr:`/`npm:`/`https:` specifiers, not a `package.json`.
- `verify_jwt = false` in `config.toml` for every agent: tenant identity is
  resolved via `x-tenant-slug` + the `tenants` table, and the service-role
  key gates inter-agent calls. Before exposing any agent to a public
  frontend directly, add real end-user auth (Supabase Auth JWT) on top of
  this — the current scaffold assumes trusted server-to-server callers.
- Every agent except Operations currently only implements a `ping` action
  as a placeholder — replace with real domain actions per agent, following
  `supabase/functions/operations/` as the reference implementation.
