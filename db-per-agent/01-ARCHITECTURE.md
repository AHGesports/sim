# Architecture: Per-Agent Database Isolation + Global DB

## Design Principles

This architecture follows **SOLID, KISS, YAGNI, DRY**:

| Principle | Application |
|-----------|-------------|
| **SRP** (SOLID) | Separate tables for each concern: global DB, agent DB, user budget |
| **KISS** | postgres-mcp (just connection string), simple schema |
| **YAGNI** | No OAuth fields until needed, minimal columns |
| **DRY** | One service for all DB operations, shared patterns across tables |

---

## Why Project-per-Agent (Not Branch-per-Agent)

| Factor | Project-per-Agent | Branch-per-Agent |
|--------|-------------------|------------------|
| **Schema Independence** | Complete - each agent can ALTER freely | Partial - copy-on-write from parent |
| **Isolation** | Complete - separate compute/storage | Shared - parent project resources |
| **Quotas** | Per-agent configurable | Shared across all branches |
| **Limits** | 30K free (Agent Plan) or 1000 (Scale) | 10-500 per project |
| **MCP Compatibility** | Perfect - independent connection | Works but shared resources |
| **Billing** | Clear per-agent usage | Aggregated, hard to track |

**Verdict**: Project-per-Agent is the clear winner for the MCP use case.

---

## Global DB Architecture

Each user gets ONE global database accessible by ALL their agents:

| Feature | Global DB | Agent DB |
|---------|-----------|----------|
| Scope | Per user | Per workspace/agent |
| Access | All user's agents | Single agent only |
| Use case | Shared data, cross-agent state | Agent-specific data |
| Created | On user registration | On workspace creation |
| Deleted | On user deletion | On workspace deletion |

**Data Sharing**: If Agent A modifies a table in Global DB, Agent B immediately sees the change.

**Future**: Per-agent permissions via PostgreSQL roles (YAGNI - add when needed).

---

## Data Model

### Why Separate Table (Not Columns on Workspace)

| Approach | Pros | Cons |
|----------|------|------|
| **Columns on workspace** | Simpler initially | Violates SRP, harder to extend |
| **Separate table** | Clean separation, extensible, supports future OAuth | Extra join |

**Decision**: Separate tables for SOLID compliance and future flexibility.

### Schema (YAGNI-Compliant)

```sql
-- Table 1: user_global_database (per-user global DB)
CREATE TABLE user_global_database (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,

  -- Ownership: 'platform' (we manage) or 'user' (future: they connect own)
  ownership_type TEXT NOT NULL DEFAULT 'platform',

  -- Neon project info (for platform-managed)
  neon_project_id TEXT,
  neon_branch_id TEXT,
  neon_connection_uri TEXT,  -- MUST be encrypted at rest
  database_name TEXT NOT NULL DEFAULT 'neondb',

  -- Per-project consumption tracking
  current_period_cost_cents INTEGER DEFAULT 0,
  last_consumption_sync TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP,

  -- Constraints
  UNIQUE(user_id)  -- 1:1 relationship
);

CREATE INDEX idx_user_global_database_user_id ON user_global_database(user_id);

-- Table 2: workspace_database (per-agent DB)
CREATE TABLE workspace_database (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,

  -- Ownership: 'platform' (we manage) or 'user' (future: they connect own)
  ownership_type TEXT NOT NULL DEFAULT 'platform',

  -- Neon project info (for platform-managed)
  neon_project_id TEXT,
  neon_branch_id TEXT,
  neon_connection_uri TEXT,  -- MUST be encrypted at rest
  database_name TEXT NOT NULL DEFAULT 'neondb',

  -- Per-project consumption tracking
  current_period_cost_cents INTEGER DEFAULT 0,
  last_consumption_sync TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP,

  -- Constraints
  UNIQUE(workspace_id)  -- 1:1 relationship
);

CREATE INDEX idx_workspace_database_workspace_id ON workspace_database(workspace_id);

-- Table 3: user_db_budget (user-level budget covering ALL DBs)
CREATE TABLE user_db_budget (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,

  -- Budget configuration (tier derived from user's subscription plan)
  custom_budget_cents INTEGER,               -- Override for special cases

  -- Status
  budget_exceeded BOOLEAN NOT NULL DEFAULT FALSE,

  -- Total consumption tracking (sum of all DBs)
  current_period_start TIMESTAMP NOT NULL DEFAULT NOW(),
  total_cost_cents INTEGER DEFAULT 0,
  last_sync TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP,

  -- Constraints
  UNIQUE(user_id)  -- 1:1 relationship
);

CREATE INDEX idx_user_db_budget_user_id ON user_db_budget(user_id);
```

### What We're NOT Adding (YAGNI)

These fields are intentionally omitted - add only when implementing OAuth:
- `user_neon_account_id`
- `oauth_token_encrypted`
- `oauth_refresh_token`
- `oauth_expires_at`

### Ownership Type

| Value | Meaning | Who Pays | Who Manages |
|-------|---------|----------|-------------|
| `platform` | We created via our API key | Us | Us |
| `user` | User connected their own (future) | User | User |

**Current implementation**: Only `platform` type. The field exists for future extensibility.

### Budget Tiers

| Tier | Monthly Budget | Notes |
|------|---------------|-------|
| `free` | $2.00 | Default for all users |
| `paid` | $20.00 | For paid plan users |
| `enterprise` | $100.00 | For enterprise users |
| `custom` | Variable | Uses `custom_budget_cents` field |

---

## Entity Relationship

```
┌─────────────────┐         ┌─────────────────────────┐
│      user       │ 1 ─── 1 │  user_global_database   │
├─────────────────┤         ├─────────────────────────┤
│ id (PK)         │◄────────│ user_id (FK)            │
│ email           │         │ id (PK)                 │
│ ...             │         │ neon_project_id         │
│                 │         │ neon_connection_uri     │
│                 │         │ current_period_cost_cents│
│                 │         └─────────────────────────┘
│                 │
│                 │ 1 ─── 1 ┌─────────────────────────┐
│                 │         │    user_db_budget       │
│                 │◄────────├─────────────────────────┤
│                 │         │ user_id (FK)            │
│                 │         │ total_cost_cents        │
│                 │         │ budget_exceeded         │
│                 │         │ (tier from subscription)│
└─────────────────┘         └─────────────────────────┘
        │
        │ (via workspace.user_id)
        │
        ▼
┌─────────────────┐         ┌─────────────────────────┐
│    workspace    │ 1 ─── 1 │   workspace_database    │
├─────────────────┤         ├─────────────────────────┤
│ id (PK)         │◄────────│ workspace_id (FK)       │
│ name            │         │ id (PK)                 │
│ user_id (FK)    │         │ neon_project_id         │
│ ...             │         │ neon_connection_uri     │
└─────────────────┘         │ current_period_cost_cents│
                            └─────────────────────────┘
```

**Budget Scope**: `user_db_budget.total_cost_cents` = sum of:
- `user_global_database.current_period_cost_cents`
- All `workspace_database.current_period_cost_cents` for user's workspaces

---

## Lifecycle Integration

### On User Registration

**File**: `apps/sim/lib/auth/auth.ts` - `handleNewUser()`

```typescript
async function handleNewUser(userId: string) {
  // 1. Create userStats (existing)
  await createUserStats(userId);

  // 2. Create global database (NEW)
  const globalDb = await createUserGlobalDatabase(userId, 'free');

  // 3. Create budget record (NEW)
  await db.insert(userDbBudget).values({
    userId,
    budgetTier: 'free',
  });

  // 4. Store encrypted connection string as user env var
  await createUserEnvVar(userId, 'GLOBAL_DB_URL', globalDb.connectionUri);
}
```

**Error Handling**: If global DB creation fails, the entire registration fails (transaction rollback).

### On Workspace Create

**File**: `apps/sim/app/api/workspaces/route.ts`

```typescript
async function createWorkspace(userId: string, name: string) {
  const workspaceId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    // Existing: create workspace, permissions, workflow
    await tx.insert(workspace).values({ ... });
    await tx.insert(permissions).values({ ... });
    await tx.insert(workflow).values({ ... });

    // NEW: Create agent database
    const agentDb = await createAgentDatabase(workspaceId, 'free');

    // NEW: Insert workspace_database record
    await tx.insert(workspaceDatabase).values({
      workspaceId,
      ownershipType: 'platform',
      neonProjectId: agentDb.projectId,
      neonBranchId: agentDb.branchId,
      neonConnectionUri: encrypt(agentDb.connectionUri),
      databaseName: agentDb.databaseName,
    });

    // NEW: Store as workspace env var
    await tx.insert(workspaceEnvironment).values({
      workspaceId,
      variables: encrypt({ AGENT_DB_URL: agentDb.connectionUri }),
    });
  });
}
```

### On Workspace Delete

**File**: `apps/sim/app/api/workspaces/[id]/route.ts`

```typescript
// Before deleting workspace
const dbConfig = await getWorkspaceDatabase(workspaceId);
if (dbConfig?.ownershipType === 'platform' && dbConfig.neonProjectId) {
  await deleteAgentDatabase(dbConfig.neonProjectId);
}
// CASCADE handles workspace_database deletion
```

### On User Delete

```typescript
// Before deleting user
const globalDbConfig = await getUserGlobalDatabase(userId);
if (globalDbConfig?.ownershipType === 'platform' && globalDbConfig.neonProjectId) {
  await deleteAgentDatabase(globalDbConfig.neonProjectId);
}
// CASCADE handles:
// - user_global_database deletion
// - user_db_budget deletion
// - workspace deletions (which trigger workspace_database deletions)
```

### On Tier Change

```typescript
// Update user budget tier
await db.update(userDbBudget)
  .set({ budgetTier: newTier, updatedAt: new Date() })
  .where(eq(userDbBudget.userId, userId));

// Note: No need to update Neon project settings - we use cost-budget model
// with autoscaling, not hard resource quotas
```

---

## Connection String Handling

### Security Requirements

1. **Encrypt at rest** - Connection URI contains password
2. **Never expose to frontend** - Only backend/MCP uses it
3. **Decrypt only when needed** - For MCP config or DB operations

### Format

```
postgresql://[user]:[password]@[host]/[database]?sslmode=require
```

For pooled connections (recommended):
```
postgresql://[user]:[password]@[host]-pooler/[database]?sslmode=require
```

---

## MCP Integration

**Using postgres-mcp** (not neon-mcp):

| Reason | Benefit |
|--------|---------|
| Simpler setup | Just needs connection string |
| Works with any Postgres | Future-proof for user-owned DBs |
| Sufficient for CRUD | SELECT, INSERT, UPDATE, DELETE, DDL |
| Free | Open source |

### MCP Config (Environment Variable Pattern)

Connection strings are stored in encrypted env vars and resolved server-side:

```json
{
  "postgres-global": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres", "${GLOBAL_DB_URL}"]
  },
  "postgres-agent": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres", "${AGENT_DB_URL}"]
  }
}
```

### Resolution Flow (All Server-Side)

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

**Security**: MCP servers are hidden from users - they only see query results, never connection strings.
