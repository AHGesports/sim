# Global Database Architecture

## Overview

Each user gets **one global database** accessible by **all their agents**. This enables:

- Shared data across agents
- Cross-agent state management
- Centralized data storage

---

## Global DB vs Agent DB

| Feature | Global DB | Agent DB |
|---------|-----------|----------|
| **Scope** | Per user | Per workspace/agent |
| **Access** | All user's agents | Single agent only |
| **Use case** | Shared data, cross-agent state | Agent-specific data |
| **Created** | On user registration | On workspace creation |
| **Deleted** | On user deletion | On workspace deletion |
| **Env var** | `GLOBAL_DB_URL` | `AGENT_DB_URL` |

---

## Data Sharing Behavior

**All agents see the same data in Global DB:**

```
Agent A creates table "customers"
→ Agent B can immediately SELECT from "customers"
→ Agent C can INSERT into "customers"
→ Changes are visible to all agents instantly
```

**Agent DBs are isolated:**

```
Agent A's database has table "orders"
→ Agent B CANNOT see Agent A's "orders" table
→ Each agent has its own isolated database
```

---

## Schema

```sql
CREATE TABLE user_global_database (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,

  -- Ownership
  ownership_type TEXT NOT NULL DEFAULT 'platform',

  -- Neon project info
  neon_project_id TEXT,
  neon_branch_id TEXT,
  neon_connection_uri TEXT,  -- Encrypted at rest
  database_name TEXT NOT NULL DEFAULT 'neondb',

  -- Cost tracking (for budget enforcement)
  current_period_cost_cents INTEGER DEFAULT 0,
  last_consumption_sync TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP,

  UNIQUE(user_id)  -- 1:1 relationship
);
```

---

## Creation Flow

**Trigger**: User registration (`handleNewUser()`)

```typescript
// apps/sim/lib/auth/auth.ts
async function handleNewUser(userId: string) {
  // 1. Create Neon project for global DB
  const globalDb = await neonService.createAgentDatabase(
    `global-${userId}`,
    'free'
  );

  // 2. Store record in database
  await db.insert(userGlobalDatabase).values({
    userId,
    ownershipType: 'platform',
    neonProjectId: globalDb.projectId,
    neonBranchId: globalDb.branchId,
    neonConnectionUri: encrypt(globalDb.connectionUri),
    databaseName: globalDb.databaseName,
  });

  // 3. Store as user environment variable
  await createUserEnvVar(userId, 'GLOBAL_DB_URL', globalDb.connectionUri);
}
```

**Error Handling**: If creation fails, the entire registration fails.

---

## Deletion Flow

**Trigger**: User account deletion

```typescript
async function handleUserDelete(userId: string) {
  // 1. Get global DB config
  const globalDbConfig = await getUserGlobalDatabase(userId);

  // 2. Delete Neon project (if platform-managed)
  if (globalDbConfig?.ownershipType === 'platform' && globalDbConfig.neonProjectId) {
    await neonService.deleteAgentDatabase(globalDbConfig.neonProjectId);
  }

  // 3. CASCADE handles record deletion
}
```

---

## MCP Access

Agents access Global DB via the `GLOBAL_DB_URL` environment variable:

```json
{
  "postgres-global": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres", "${GLOBAL_DB_URL}"]
  }
}
```

**Resolution Flow** (server-side only):

1. Backend reads MCP config
2. Backend decrypts `GLOBAL_DB_URL` from user env vars
3. Backend spawns postgres-mcp with resolved connection string
4. Results returned to agent (connection string never exposed)

---

## Query Helpers

```typescript
// lib/db/queries.ts

export async function getUserGlobalDatabase(userId: string) {
  const result = await db
    .select()
    .from(userGlobalDatabase)
    .where(eq(userGlobalDatabase.userId, userId))
    .limit(1);

  return result[0] ?? null;
}

export async function getUserGlobalConnectionUri(userId: string): Promise<string | null> {
  const config = await getUserGlobalDatabase(userId);
  if (!config?.neonConnectionUri) return null;
  return decrypt(config.neonConnectionUri);
}
```

---

## Future: Per-Agent Permissions (YAGNI)

When needed, add a permissions table:

```sql
CREATE TABLE agent_global_db_permissions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  user_id TEXT NOT NULL REFERENCES user(id),

  -- Permissions
  can_read BOOLEAN DEFAULT TRUE,
  can_write BOOLEAN DEFAULT TRUE,
  can_create_tables BOOLEAN DEFAULT TRUE,
  can_drop_tables BOOLEAN DEFAULT FALSE,

  -- Table-level restrictions (optional)
  allowed_tables TEXT[],  -- NULL = all tables

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Implementation**: Use PostgreSQL roles or application-level checks.

---

## API Routes

### Get Global DB Schema

```typescript
// GET /api/users/[userId]/global-database/tables
export async function GET(req: Request, { params }: { params: { userId: string } }) {
  const dbConfig = await getUserGlobalDatabase(params.userId);

  if (!dbConfig) {
    return Response.json({ error: 'No global database configured' }, { status: 404 });
  }

  const schema = await getAgentSchema(dbConfig.neonProjectId, dbConfig.neonBranchId);
  return Response.json({ tables: schema.tables });
}
```

### Query Global DB

```typescript
// POST /api/users/[userId]/global-database/query
export async function POST(req: Request, { params }: { params: { userId: string } }) {
  const { table, limit = 100, offset = 0 } = await req.json();
  const dbConfig = await getUserGlobalDatabase(params.userId);

  if (!dbConfig) {
    return Response.json({ error: 'No global database configured' }, { status: 404 });
  }

  const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '');
  const connectionUri = decrypt(dbConfig.neonConnectionUri);
  const result = await executeQuery(connectionUri, `SELECT * FROM "${safeTable}" LIMIT ${limit} OFFSET ${offset}`);

  return Response.json({ rows: result, table: safeTable });
}
```

---

## Security

| Item | Visible to User? |
|------|------------------|
| Database exists | Yes |
| Table names | Yes (via API) |
| Query results | Yes |
| Connection string | **Never** |
| MCP server | **No** (hidden) |

Connection strings are stored encrypted and only decrypted server-side for MCP execution.
