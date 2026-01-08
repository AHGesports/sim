# Neon Per-Agent Database System

## Executive Summary

**Goal**: Isolated database per agent + shared global database per user, where agents can do CRUD operations and modify schema independently via MCP.

**Architecture**: **Project-per-Agent** + **Project-per-User (Global DB)** using Neon's serverless Postgres.
**MCP**: **postgres-mcp** (works with any Postgres, including Neon)
**Design Principles**: SOLID, KISS, YAGNI, DRY
**Cost Model**: **User-level budget** with per-agent cost tracking

## Key Concepts

| Term | Description |
|------|-------------|
| **Your Backend** | Single Neon API consumer (one API key manages all agent databases) |
| **Users** | Never interact with Neon directly; user management stays in your local Postgres |
| **Global DB** | One shared database per user, accessible by all their agents |
| **Agent DB** | Each agent (workspace) gets own Neon project with connection string |
| **postgres-mcp** | Standard Postgres MCP server - works with Neon (which IS Postgres) |
| **User Budget** | Total cost limit covering all DBs (global + all agents) |

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Sim Studio                                 │
├─────────────────────────────────────────────────────────────────────┤
│  Users ←→ Your UI ←→ Your Backend ←→ Local Postgres (user mgmt)     │
│                            │                                         │
│                            ▼                                         │
│                    Neon API (single API key)                         │
│                            │                                         │
│         ┌──────────────────┼──────────────────┐                      │
│         │                  │                  │                      │
│         ▼                  ▼                  ▼                      │
│    Global DB          Agent DB A         Agent DB B    (per user/   │
│    (User 1)           (Workspace 1)      (Workspace 2)   agent)     │
│         │                  │                  │                      │
│         └────────┬─────────┴─────────┬────────┘                      │
│                  ▼                   ▼                               │
│           postgres-mcp ←── Connection Strings (encrypted env vars)  │
│           (GLOBAL_DB_URL)    (AGENT_DB_URL)                         │
└─────────────────────────────────────────────────────────────────────┘
```

**Security**: Connection strings stored in encrypted environment variables, resolved server-side only. Users never see raw connection strings.

## Data Model

Three new tables for database management:

```sql
user (existing)
    │
    ├── user_global_database (1:1 - global DB per user)
    │       ├── neon_project_id
    │       ├── neon_connection_uri (encrypted)
    │       └── current_period_cost_cents
    │
    └── user_db_budget (1:1 - budget tracking per user)
            ├── (tier from user's subscription plan)
            ├── total_cost_cents (sum of all DBs)
            └── budget_exceeded (boolean)

workspace (existing)
    │
    └── workspace_database (1:1 - agent DB per workspace)
            ├── neon_project_id
            ├── neon_connection_uri (encrypted)
            └── current_period_cost_cents
```

**Budget Model**: User-level budget covers ALL databases (global + all agents combined).

## Documentation Index

| Document | Description |
|----------|-------------|
| [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) | System architecture, separate table design, data model |
| [02-COST-OPTIMIZATION.md](./02-COST-OPTIMIZATION.md) | Agent Plan vs Scale Plan, pricing strategies |
| [03-API-INTEGRATION.md](./03-API-INTEGRATION.md) | Neon SDK, service implementation, postgres-mcp |
| [04-DATABASE-EXPLORER-UI.md](./04-DATABASE-EXPLORER-UI.md) | UI strategy, components, API routes |
| [05-IMPLEMENTATION-CHECKLIST.md](./05-IMPLEMENTATION-CHECKLIST.md) | Phased implementation plan |
| [06-GLOBAL-DATABASE.md](./06-GLOBAL-DATABASE.md) | Global DB architecture and user sharing |
| [07-COST-TRACKING.md](./07-COST-TRACKING.md) | Cost-budget model, consumption tracking, per-agent costs |
| [08-SIM-INTEGRATION.md](./08-SIM-INTEGRATION.md) | Lifecycle hooks for user/workspace creation |
| [09-SECURITY.md](./09-SECURITY.md) | Connection string security, MCP integration |

## Quick Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Architecture | Project-per-Agent + Project-per-User | Complete isolation for MCP schema changes |
| MCP Server | postgres-mcp | Simpler, works with any Postgres, free |
| Data Model | Separate tables | SOLID (SRP), extensible, cleaner |
| OAuth fields | Not now | YAGNI - add when implementing OAuth |
| Global DB | One per user | Shared data accessible by all user's agents |
| Budget scope | Per user (not per DB) | Simpler, covers all DBs combined |
| Cost tracking | Per agent/workspace | Users can see which agents consume most |
| Quota approach | Cost-budget (not hard limits) | Flexible resource usage within budget |
| DB creation failure | Fail registration | Strict consistency over availability |
| MCP server visibility | Hidden from users | Connection strings must not be exposed |
| Connection security | Encrypted env vars | Server-side resolution only |

## Key Limits At-a-Glance

| Limit | Agent Plan (Free Org) | Scale Plan |
|-------|----------------------|------------|
| Projects | 30,000 FREE | 1,000 (+$50/1K) |
| Compute | Per-project quotas | 750 hrs shared |
| Storage | 512 MB/project | 50 GB total |
| Cold Start | ~500ms | ~500ms |
| Create Time | <1 second | <1 second |

### User Budget Tiers

| Tier | Monthly Budget | Notes |
|------|---------------|-------|
| Free | $2.00 | Covers global DB + all agent DBs |
| Paid | $20.00 | Higher limit for power users |
| Enterprise | $100.00 | Custom limits available |

## Next Steps

1. **Apply for Neon Agent Plan** - Email Neon, explain your platform
2. **Start with Scale Plan** as fallback while waiting
3. **Implement in phases**:
   - Phase 1: Schema + Neon Service
   - Phase 2: Sim Integration (user registration + workspace creation hooks)
   - Phase 3: MCP Integration with env var pattern
   - Phase 4: Cost tracking + budget enforcement
   - Phase 5: Database Explorer UI
4. **DB Explorer UI** can come later, agents just need connection string first

## Lifecycle Integration

| Event | Action |
|-------|--------|
| User Registration | Create global DB, store `GLOBAL_DB_URL` in user env vars |
| Workspace Creation | Create agent DB, store `AGENT_DB_URL` in workspace env vars |
| Workspace Deletion | Delete agent DB (if platform-managed) |
| User Deletion | Delete global DB + cascade deletes agent DBs |

## Security Model

```
Agent executes MCP tool
→ Backend loads MCP config (contains ${GLOBAL_DB_URL})
→ Backend calls getEffectiveDecryptedEnv()
→ Backend decrypts connection string from env table
→ Backend resolves ${GLOBAL_DB_URL} → actual connection string
→ Backend spawns postgres-mcp with resolved connection string
→ postgres-mcp executes query
→ Backend returns only query results (no connection info)
```

**What Users See**:
- ✅ Database exists (settings panel shows "Database: Connected")
- ✅ Table names (via schema API)
- ✅ Query results
- ❌ Connection strings (never exposed)
- ❌ MCP server in list (system-managed, hidden)
