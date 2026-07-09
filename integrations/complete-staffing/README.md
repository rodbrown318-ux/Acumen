# Complete Staffing

First business integration for the Business OS. A staffing agency that
places W-2 employees at client sites.

## Files

- `tenant.json` — tenant identity and which agents are enabled for this business.
- `hr.config.json`, `compliance.config.json` — example agent-specific config.
  Add `sales.config.json`, `operations.config.json`, `finance.config.json`,
  `marketing.config.json`, `design.config.json` as those agents grow
  business-specific behavior.

## Setup

1. Insert a row into the shared `tenants` table with `slug = "complete-staffing"`.
2. Callers pass `x-tenant-slug: complete-staffing` on every agent request.
3. Agents load this folder's config to customize behavior for this tenant —
   see `supabase/functions/_shared/handler.ts` for how tenant context flows
   into each action handler.

See the root `CLAUDE.md` for the full architecture.
