# Implementation Checklist

## Phase 1: Database Schema & Neon Service ✅ COMPLETE

### Schema Changes ✅
- [x] Add migration for new tables (`packages/db/migrations/0136_per_agent_databases.sql`):

**user_global_database** (per-user global DB):
```sql
CREATE TABLE user_global_database (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  ownership_type TEXT NOT NULL DEFAULT 'platform',
  neon_project_id TEXT,
  neon_branch_id TEXT,
  neon_connection_uri TEXT,  -- Encrypted at rest
  database_name TEXT NOT NULL DEFAULT 'neondb',
  current_period_cost_cents INTEGER DEFAULT 0,
  last_consumption_sync TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP,
  UNIQUE(user_id)
);
CREATE INDEX idx_user_global_database_user_id ON user_global_database(user_id);
```

**workspace_database** (per-agent DB):
```sql
CREATE TABLE workspace_database (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  ownership_type TEXT NOT NULL DEFAULT 'platform',
  neon_project_id TEXT,
  neon_branch_id TEXT,
  neon_connection_uri TEXT,  -- Encrypted at rest
  database_name TEXT NOT NULL DEFAULT 'neondb',
  current_period_cost_cents INTEGER DEFAULT 0,
  last_consumption_sync TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP,
  UNIQUE(workspace_id)
);
CREATE INDEX idx_workspace_database_workspace_id ON workspace_database(workspace_id);
```

**user_db_budget** (user-level budget):
```sql
CREATE TABLE user_db_budget (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  -- Budget tier is derived from user's subscription plan (free/pro/team/enterprise)
  -- No budget_tier column - we look up the user's subscription instead
  custom_budget_cents INTEGER,  -- Override for special cases
  budget_exceeded BOOLEAN NOT NULL DEFAULT FALSE,
  current_period_start TIMESTAMP NOT NULL DEFAULT NOW(),
  total_cost_cents INTEGER DEFAULT 0,
  last_sync TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP,
  UNIQUE(user_id)
);
CREATE INDEX idx_user_db_budget_user_id ON user_db_budget(user_id);
CREATE INDEX idx_user_db_budget_exceeded ON user_db_budget(budget_exceeded);
```

- [x] Add Drizzle schemas in `packages/db/schema.ts`:
  - [x] `userGlobalDatabase`
  - [x] `workspaceDatabase`
  - [x] `userDbBudget`

### Neon Service ✅
- [x] Install packages:
  ```bash
  bun add @neondatabase/api-client @neondatabase/serverless
  ```
- [x] Create `lib/neon/` with SOLID file structure:

| File | Purpose | Status |
|------|---------|--------|
| `client.ts` | API client singleton | ✅ |
| `config.ts` | NEON_PROJECT_DEFAULTS | ✅ |
| `projects.ts` | createNeonProject, deleteNeonProject (DRY) | ✅ |
| `agent-database.ts` | createAgentDatabase (workspace domain) | ✅ |
| `global-database.ts` | createUserGlobalDatabase (user domain) | ✅ |
| `types.ts` | NeonDatabaseResult | ✅ |
| `index.ts` | Barrel exports | ✅ |

**Key Design Decisions:**
- Uses full workspaceId/userId for project names (no truncation = no collisions)
- Low-level `createNeonProject()` is DRY - used by both domain functions
- API client is singleton (lazily initialized)
- Fail hard on missing NEON_API_KEY or API errors

### Environment Setup
- [x] Add `NEON_API_KEY` to `.env.example`
- [x] Add `NEON_CONNECTION_ENCRYPTION_KEY` to `.env.example`
- [x] Add encryption utility (`lib/encryption.ts`)
- [x] Add `NEON_COMPUTE_PRICE_PER_CU_HOUR` to `.env.example` (default: 0.16)
- [x] Add `NEON_STORAGE_PRICE_PER_GB_MONTH` to `.env.example` (default: 0.35)

---

## Phase 2: Sim Integration (Lifecycle Hooks) ✅ COMPLETE

### On User Registration ✅
**File**: `apps/sim/lib/billing/core/usage.ts` - `handleNewUser()` + `initializeUserNeonDatabase()`
- [x] Call `createUserGlobalDatabase(userId)` to create global DB
- [x] Insert record into `user_global_database` table with:
  - `neonProjectId` from result
  - `neonConnectionUri` encrypted
  - `neonBranchId` from result
- [x] Insert record into `user_db_budget` table (budget tier derived from subscription at runtime)
- [x] Handle creation failures gracefully (logs error, doesn't fail registration)

**Note**: Storing `GLOBAL_DB_URL` in environment variables is part of Phase 3 (MCP Integration).

### On Workspace Create ✅
**File**: `apps/sim/app/api/workspaces/route.ts` - `createWorkspace()` + `initializeWorkspaceNeonDatabase()`
- [x] Call `createAgentDatabase(workspaceId)` after workspace created
- [x] Insert record into `workspace_database` table with:
  - `neonProjectId` from result
  - `neonConnectionUri` encrypted
  - `neonBranchId` from result
- [x] Handle creation failures gracefully (async, non-blocking)

**Note**: Storing `AGENT_DB_URL` in environment variables is part of Phase 3 (MCP Integration).

### On Workspace Delete ✅
**File**: `apps/sim/app/api/workspaces/[id]/route.ts` - DELETE handler + `deleteWorkspaceNeonProject()`
- [x] Look up `workspace_database` record by workspaceId
- [x] Check `ownership_type` before deleting Neon project
- [x] Call `deleteNeonProject(projectId)` for platform-owned DBs
- [x] CASCADE handles `workspace_database` record deletion

### On User Delete ✅
**File**: `apps/sim/lib/billing/core/usage.ts` - `handleUserDeletion()` + auth.ts delete hook
- [x] Look up `user_global_database` record by userId
- [x] Call `deleteNeonProject(projectId)` for global DB
- [x] CASCADE handles `user_global_database` and `user_db_budget` deletion
- [x] Workspace deletions cascade and trigger their own DB deletions

### On Tier Change (Deferred to Phase 4)
- [ ] Budget tier is derived from user's subscription (no DB update needed)
- [ ] If upgrading from exceeded state, resume paused projects
- [ ] No need to update Neon settings (cost-budget model)

---

## Phase 3: MCP Integration + External API Access (DETAILED)

### Overview

**Goals**:
1. Enable agents to connect to BOTH their workspace-specific DB (`AGENT_DB_URL`) AND the user's global DB (`GLOBAL_DB_URL`) via postgres-mcp
2. **Unified access** for both Sim (workflow execution) and AutomationAgentApi (AI agents like browser-use)

**Key Insight**: Unlike user-configured MCP servers (stored in `mcp_servers` table), the database MCP servers are **system-managed** and injected automatically.

**postgres-mcp Reference**: [crystaldba/postgres-mcp](https://github.com/crystaldba/postgres-mcp)

---

### Architecture: Unified MCP Access (Sim + AutomationAgentApi)

The system-managed MCP servers are accessible to **both**:
1. **Sim** - For workflow execution (existing MCP infrastructure)
2. **AutomationAgentApi** - For AI agents (browser-use, custom agents)

**Key Design Decision**: AutomationAgentApi calls **Sim's API** for MCP operations. No duplicate MCP logic.

**Flow for Sim (Workflow Execution)**:
```
Workflow Execution
    │
    ├── MCP Service loads system servers (postgres-agent, postgres-global)
    ├── Resolves connection strings from encrypted DB records
    ├── Spawns postgres-mcp via stdio transport
    ├── Agent executes database operations via MCP tools
    └── Results returned to workflow
```

**Flow for AutomationAgentApi (AI Agents)**:
```
AutomationAgentApi (external service)
    │
    ├── 1. Call Sim API: GET /api/mcp/system-tools (get available tools)
    ├── 2. Pass tool schemas to AI agent (browser-use, etc.)
    │
    ▼
AI Agent decides to call a tool
    │
    ├── 3. Call Sim API: POST /api/mcp/tools/execute
    │      Body: { serverId, toolName, arguments, workspaceId }
    │
    ▼
Sim handles MCP execution
    │
    ├── Spawns postgres-mcp with stdio transport
    ├── Executes tool
    ├── Returns result
    │
    ▼
AutomationAgentApi receives result → continues agent loop
```

**Why this approach?**
- ✅ No duplicate MCP logic
- ✅ Single source of truth for connections
- ✅ AutomationAgentApi doesn't need DB credentials
- ✅ Works for local and hosted deployments
- ✅ Sim already has all the infrastructure

**Environment Variables**:
```env
# In AutomationAgentApi
SIM_API_URL=https://sim.example.com  # or http://localhost:3000 for local
SIM_API_KEY=secret                    # Internal API auth
```

---

### Step 3.0: API Endpoints for AutomationAgentApi

**Purpose**: Expose MCP tool discovery and execution for external services (AutomationAgentApi).

**Existing endpoint** (already works):
- `POST /api/mcp/tools/execute` - Execute MCP tool

**New endpoint needed**:
- `GET /api/mcp/system-tools` - Get system MCP tools (no connection required)

**Files to create/modify**:
- [ ] `apps/sim/app/api/mcp/system-tools/route.ts` - New endpoint for system tools

**Authentication for AutomationAgentApi**:
```typescript
// Validate internal API key for AutomationAgentApi
function validateInternalApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-internal-api-key')
  return apiKey === process.env.INTERNAL_API_KEY
}
```

**AutomationAgentApi Usage Example**:
```typescript
// In AutomationAgentApi service
const SIM_API_URL = process.env.SIM_API_URL

async function getAvailableTools(workspaceId: string): Promise<McpTool[]> {
  const response = await fetch(
    `${SIM_API_URL}/api/mcp/system-tools?workspaceId=${workspaceId}`,
    { headers: { 'x-internal-api-key': process.env.SIM_API_KEY } }
  )
  const data = await response.json()
  return data.data.tools
}

async function executeTool(
  workspaceId: string,
  serverId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(`${SIM_API_URL}/api/mcp/tools/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-api-key': process.env.SIM_API_KEY,
    },
    body: JSON.stringify({ workspaceId, serverId, toolName, arguments: args }),
  })
  const data = await response.json()
  return data.data.output
}
```

---

### Step 3.0.1: One-Time Discovery + Permanent Cache for Tool Schemas

**Problem**: postgres-mcp doesn't export tool schemas as a standalone file. Schemas are in Python code.

**Solution**: One-time MCP discovery → cache schemas permanently in DB.

**Flow**:
```
First request for system tools
    │
    ├── Check DB: cached schemas exist?
    │   ├── YES → Return cached schemas (no connection)
    │   └── NO → Continue to discovery
    │
    ├── Connect to postgres-mcp once
    ├── Call listTools() to get schemas
    ├── Cache schemas in DB (never expires)
    ├── Disconnect
    │
    └── Return schemas
```

**Database table for cached schemas**:
```sql
CREATE TABLE mcp_tool_schema_cache (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  server_type TEXT NOT NULL,  -- 'postgres-agent' | 'postgres-global'
  tool_name TEXT NOT NULL,
  tool_schema JSONB NOT NULL,  -- { name, description, inputSchema }
  discovered_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(server_type, tool_name)
);
```

**Implementation**:
```typescript
// apps/sim/lib/mcp/system-tool-cache.ts

import { db } from '@sim/db'
import { mcpToolSchemaCache } from '@sim/db/schema'
import { eq } from 'drizzle-orm'

/**
 * Get cached tool schemas for a server type.
 * Returns null if not cached (triggers discovery).
 */
export async function getCachedToolSchemas(
  serverType: 'postgres-agent' | 'postgres-global'
): Promise<McpToolSchema[] | null> {
  const cached = await db
    .select()
    .from(mcpToolSchemaCache)
    .where(eq(mcpToolSchemaCache.serverType, serverType))

  if (cached.length === 0) return null

  return cached.map(row => row.toolSchema)
}

/**
 * Cache tool schemas after discovery.
 * Called once per server type, never expires.
 */
export async function cacheToolSchemas(
  serverType: 'postgres-agent' | 'postgres-global',
  tools: McpToolSchema[]
): Promise<void> {
  await db.transaction(async (tx) => {
    // Clear old cache for this server type
    await tx
      .delete(mcpToolSchemaCache)
      .where(eq(mcpToolSchemaCache.serverType, serverType))

    // Insert new schemas
    await tx.insert(mcpToolSchemaCache).values(
      tools.map(tool => ({
        serverType,
        toolName: tool.name,
        toolSchema: tool,
      }))
    )
  })
}

/**
 * Discover and cache tool schemas (one-time operation).
 */
export async function discoverAndCacheToolSchemas(
  serverType: 'postgres-agent' | 'postgres-global',
  connectionUri: string
): Promise<McpToolSchema[]> {
  // Spawn postgres-mcp temporarily to discover tools
  const config = {
    transport: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@anthropic-ai/postgres-mcp', connectionUri],
  }

  const client = await createStdioClient(config)
  try {
    const tools = await client.listTools()
    await cacheToolSchemas(serverType, tools)
    return tools
  } finally {
    await client.disconnect()
  }
}
```

**postgres-mcp tools that will be discovered**:
| Tool | Description |
|------|-------------|
| `list_schemas` | List all schemas in the database |
| `list_objects` | List tables, views, sequences, extensions |
| `get_object_details` | Get columns, constraints, indexes |
| `execute_sql` | Execute SQL statements |
| `explain_query` | Get execution plan |
| `get_top_queries` | Report slowest queries |
| `analyze_workload_indexes` | Recommend indexes for workload |
| `analyze_query_indexes` | Recommend indexes for queries |
| `analyze_db_health` | Health checks |

**Tasks**:
- [ ] Add migration for `mcp_tool_schema_cache` table
- [ ] Create `apps/sim/lib/mcp/system-tool-cache.ts`
- [ ] Update system tools API to use cache-first approach
- [ ] Add `createStdioClient()` method to MCP client

---

### Step 3.0.2: REMOVED - MCP Server Manager

~~**Purpose**: Dynamically spawn and manage postgres-mcp processes for AI agent sessions.~~

**Removed**: AutomationAgentApi now calls Sim's API instead of spawning its own postgres-mcp processes. This eliminates duplicate logic and simplifies the architecture.

---

### Step 3.0.3: Access Mode Configuration (Backend Prep for Phase 5 UI)

**Schema addition** to `workspace_database` table:
```sql
ALTER TABLE workspace_database
ADD COLUMN db_access_mode TEXT NOT NULL DEFAULT 'unrestricted'
CHECK (db_access_mode IN ('unrestricted', 'restricted'));
```

**Tasks**:
- [ ] Add migration for `db_access_mode` column
- [ ] Update Drizzle schema with `dbAccessMode` field
- [ ] Add `getWorkspaceDatabaseAccessMode(workspaceId)` query helper
- [ ] Respect access mode in `executeWorkspaceQuery()`

**Access Modes**:
| Mode | Allowed Operations | Use Case |
|------|-------------------|----------|
| `unrestricted` (default) | SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP | Full agent autonomy |
| `restricted` | SELECT only | Read-only agents, reporting |

**Note**: UI for changing access mode is Phase 5. Backend is prepared now.

---

### Step 3.1: Store Connection Strings in Environment Variables

**Files to modify**:
- `apps/sim/lib/billing/core/usage.ts` (update `initializeUserNeonDatabase`)
- `apps/sim/app/api/workspaces/route.ts` (update workspace creation)

**Tasks**:
- [ ] After creating global DB in `initializeUserNeonDatabase()`:
  ```typescript
  // Store GLOBAL_DB_URL in user's environment (encrypted)
  await createOrUpdateUserEnvVar(userId, 'GLOBAL_DB_URL', neonResult.connectionUri)
  ```
- [ ] After creating agent DB in workspace creation:
  ```typescript
  // Store AGENT_DB_URL in workspace environment (encrypted)
  await createOrUpdateWorkspaceEnvVar(workspaceId, 'AGENT_DB_URL', agentDb.connectionUri)
  ```

**New helper functions** (in `lib/db/queries/environment.ts`):
- [ ] `createOrUpdateUserEnvVar(userId, key, value)` - Upsert encrypted env var
- [ ] `createOrUpdateWorkspaceEnvVar(workspaceId, key, value)` - Upsert encrypted env var

---

### Step 3.2: System-Managed MCP Server Registration

**Approach**: Create "system" MCP server records that are auto-injected for workspaces with databases.

**Files to create**:
- [ ] `apps/sim/lib/mcp/system-servers.ts` - System MCP server management

**System Server Configuration**:
```typescript
// These are injected automatically, NOT user-configurable
const SYSTEM_MCP_SERVERS = {
  'postgres-global': {
    name: 'Global Database',
    description: 'User global database (shared across all workspaces)',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres', '${GLOBAL_DB_URL}'],
    envVarRequired: 'GLOBAL_DB_URL',
    systemManaged: true,
  },
  'postgres-agent': {
    name: 'Agent Database',
    description: 'Workspace-specific database (isolated per agent)',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres', '${AGENT_DB_URL}'],
    envVarRequired: 'AGENT_DB_URL',
    systemManaged: true,
  },
} as const
```

**Tasks**:
- [ ] Create `getSystemMcpServers(userId, workspaceId)`:
  - Check if `GLOBAL_DB_URL` exists in user env → include postgres-global
  - Check if `AGENT_DB_URL` exists in workspace env → include postgres-agent
  - Return list of available system servers
- [ ] Create `isSystemMcpServer(serverId)` - Returns true for system-managed servers

---

### Step 3.3: Update MCP Service to Handle System Servers

**File**: `apps/sim/lib/mcp/service.ts`

**Tasks**:
- [ ] Modify `getWorkspaceServers()` to include system servers:
  ```typescript
  async getWorkspaceServers(userId: string, workspaceId: string): Promise<McpServerConfig[]> {
    // Get user-configured servers from database
    const userServers = await this.getUserConfiguredServers(workspaceId)

    // Get system-managed servers based on available env vars
    const systemServers = await getSystemMcpServers(userId, workspaceId)

    return [...systemServers, ...userServers]
  }
  ```

- [ ] Update `resolveConfigEnvVars()` to handle stdio transport:
  ```typescript
  // For stdio transport, resolve env vars in args array
  if (resolvedConfig.args) {
    resolvedConfig.args = resolvedConfig.args.map(arg =>
      this.resolveEnvVars(arg, envVars)
    )
  }
  ```

- [ ] Add command/args fields support to `McpServerConfig` type:
  ```typescript
  interface McpServerConfig {
    // ... existing fields
    command?: string       // For stdio transport
    args?: string[]        // Command arguments
    systemManaged?: boolean
  }
  ```

---

### Step 3.3.1: Auto-Populate System MCP Tools in Agent Block (Visible in UI)

**Purpose**: System MCP tools (postgres-agent, postgres-global) are **automatically added** to Agent blocks and **visible in the tools UI**, allowing users to configure or remove them like any other tool.

---

#### Architecture: Connection-Free Tool Population

**Key Insight**: MCP connections are **expensive** (create → use → close). We must NOT open connections just to show tools in the UI.

**Current MCP Connection Flow** (from codebase analysis):
```
User opens Agent block
    ↓
useMcpTools() calls /api/mcp/tools/discover
    ↓
mcpService.discoverTools() → for each server:
    ├── createClient() → new connection
    ├── client.listTools() → fetch tools
    └── client.disconnect() → close connection
    ↓
Results cached for 5 minutes (server) / 30 seconds (frontend)
```

**Problem**: Opening DB connections just to list tools wastes resources and could overload the database.

**Solution**: Use **pre-defined schemas** for system MCP tools (postgres-mcp has stable, known tools).

---

#### Implementation: Cached Tool Schemas (From One-Time Discovery)

**Tool schemas come from Step 3.0.1's DB cache** (not manually created):

```
First request for system tools
    │
    ├── Check mcp_tool_schema_cache table
    │   ├── Cache exists → Return cached schemas (NO connection)
    │   └── Cache empty → Trigger one-time discovery (see Step 3.0.1)
    │
    └── Return tool schemas to UI
```

**When does discovery happen?**
- Triggered automatically when first user/workspace database is created
- Or manually via admin endpoint: `POST /api/admin/mcp/discover-tools`
- Only needs to run ONCE per deployment (postgres-mcp tools are stable)

---

#### Files to Create/Modify

**1. System Server Definitions** - `apps/sim/lib/mcp/system-servers.ts`

```typescript
import { getCachedToolSchemas } from './system-tool-cache'
import { getUserGlobalDatabase, getWorkspaceDatabase } from '@/lib/db/queries'

/**
 * System MCP server IDs (virtual, not stored in DB)
 */
export const SYSTEM_MCP_SERVER_IDS = {
  POSTGRES_AGENT: 'system:postgres-agent',
  POSTGRES_GLOBAL: 'system:postgres-global',
} as const

/**
 * Check if a server ID is a system server
 */
export function isSystemMcpServer(serverId: string): boolean {
  return serverId.startsWith('system:')
}

/**
 * Get system MCP servers available for a workspace.
 * Returns virtual server configs WITHOUT opening any connections.
 * Tool schemas come from DB cache (populated by one-time discovery).
 */
export async function getSystemMcpServers(
  userId: string,
  workspaceId: string
): Promise<SystemMcpServer[]> {
  const servers: SystemMcpServer[] = []

  // Get cached tool schemas (from one-time discovery - Step 3.0.1)
  const cachedSchemas = await getCachedToolSchemas('postgres-agent')
  if (!cachedSchemas) {
    // Cache is empty - discovery hasn't run yet
    // Return empty servers (tools will appear after first DB is created)
    logger.warn('MCP tool schema cache is empty. Run discovery first.')
    return []
  }

  // Check if workspace has Agent DB
  const workspaceDb = await getWorkspaceDatabase(workspaceId)
  if (workspaceDb?.neonConnectionUri) {
    servers.push({
      id: SYSTEM_MCP_SERVER_IDS.POSTGRES_AGENT,
      name: 'Agent Database',
      description: 'Workspace-specific database for this agent',
      connectionStatus: 'connected', // Always show as available
      systemManaged: true,
      tools: cachedSchemas.map(tool => ({
        ...tool,
        serverId: SYSTEM_MCP_SERVER_IDS.POSTGRES_AGENT,
        serverName: 'Agent Database',
      })),
    })
  }

  // Check if user has Global DB
  const globalDb = await getUserGlobalDatabase(userId)
  if (globalDb?.neonConnectionUri) {
    servers.push({
      id: SYSTEM_MCP_SERVER_IDS.POSTGRES_GLOBAL,
      name: 'Global Database',
      description: 'User global database shared across all workspaces',
      connectionStatus: 'connected',
      systemManaged: true,
      tools: cachedSchemas.map(tool => ({
        ...tool,
        serverId: SYSTEM_MCP_SERVER_IDS.POSTGRES_GLOBAL,
        serverName: 'Global Database',
      })),
    })
  }

  return servers
}

/**
 * Get system MCP tools for a workspace (for UI population).
 * Uses cached schemas from DB (Step 3.0.1) - NO CONNECTION REQUIRED.
 */
export async function getSystemMcpTools(
  userId: string,
  workspaceId: string
): Promise<McpTool[]> {
  const servers = await getSystemMcpServers(userId, workspaceId)
  return servers.flatMap(server => server.tools)
}
```

---

**2. API Route** - `apps/sim/app/api/mcp/system-tools/route.ts`

```typescript
import { createLogger } from '@sim/logger'
import type { NextRequest } from 'next/server'
import { getSystemMcpTools } from '@/lib/mcp/system-servers'
import { createMcpSuccessResponse, createMcpErrorResponse } from '@/lib/mcp/utils'
import { withMcpAuth } from '@/lib/mcp/middleware'

const logger = createLogger('SystemMcpToolsAPI')

/**
 * Validate internal API key for AutomationAgentApi access
 */
function validateInternalApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-internal-api-key')
  return apiKey === process.env.INTERNAL_API_KEY
}

/**
 * GET /api/mcp/system-tools
 * Returns system MCP tools WITHOUT opening any database connections.
 * Schemas come from DB cache (populated by one-time discovery - Step 3.0.1).
 *
 * Supports two auth methods:
 * 1. Session-based (for Sim UI)
 * 2. Internal API key (for AutomationAgentApi)
 */
export const GET = async (request: NextRequest) => {
  const requestId = crypto.randomUUID().slice(0, 8)

  // Check for internal API key first (AutomationAgentApi)
  if (validateInternalApiKey(request)) {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId')
    if (!workspaceId) {
      return createMcpErrorResponse(null, 'workspaceId required', 400)
    }

    // Get userId from workspace (AutomationAgentApi doesn't have session)
    const workspace = await getWorkspace(workspaceId)
    if (!workspace) {
      return createMcpErrorResponse(null, 'Workspace not found', 404)
    }

    const tools = await getSystemMcpTools(workspace.userId, workspaceId)
    return createMcpSuccessResponse({ tools })
  }

  // Fall back to session-based auth (Sim UI)
  return withMcpAuth('read')(
    async (req: NextRequest, { userId, workspaceId }) => {
      try {
        logger.info(`[${requestId}] Fetching system MCP tools`)
        const tools = await getSystemMcpTools(userId, workspaceId)
        return createMcpSuccessResponse({ tools })
      } catch (error) {
        logger.error(`[${requestId}] Error fetching system MCP tools:`, error)
        return createMcpErrorResponse(error, 'Failed to fetch system tools', 500)
      }
    }
  )(request)
}
```

---

**3. React Query Hook** - `apps/sim/hooks/queries/system-mcp.ts`

```typescript
import { useQuery } from '@tanstack/react-query'
import type { McpTool } from '@/lib/mcp/types'

export const systemMcpKeys = {
  all: ['system-mcp'] as const,
  tools: (workspaceId: string) => [...systemMcpKeys.all, 'tools', workspaceId] as const,
}

async function fetchSystemMcpTools(workspaceId: string): Promise<McpTool[]> {
  const response = await fetch(`/api/mcp/system-tools?workspaceId=${workspaceId}`)
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to fetch system MCP tools')
  }
  const data = await response.json()
  return data.data?.tools || []
}

/**
 * Fetch system MCP tools (postgres-agent, postgres-global).
 * Uses cached schemas from DB (Step 3.0.1) - NO DATABASE CONNECTION REQUIRED.
 */
export function useSystemMcpTools(workspaceId: string) {
  return useQuery({
    queryKey: systemMcpKeys.tools(workspaceId),
    queryFn: () => fetchSystemMcpTools(workspaceId),
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000, // 5 minutes (tools don't change)
  })
}
```

---

**4. Update tool-input.tsx** - Auto-populate on component load

```typescript
// In tool-input.tsx - add import
import { useSystemMcpTools } from '@/hooks/queries/system-mcp'
import { isSystemMcpServer } from '@/lib/mcp/system-servers'

// Inside ToolInput component:
const { data: systemMcpTools = [], isLoading: systemToolsLoading } = useSystemMcpTools(workspaceId)

// Auto-populate system tools on first load
const hasAutoPopulatedRef = useRef(false)

useEffect(() => {
  if (
    isPreview ||
    systemToolsLoading ||
    systemMcpTools.length === 0 ||
    hasAutoPopulatedRef.current
  ) {
    return
  }

  // Check which system tools are missing
  const missingSystemTools = systemMcpTools.filter(sysTool =>
    !selectedTools.some(t =>
      t.type === 'mcp' &&
      t.params?.serverId === sysTool.serverId &&
      t.params?.toolName === sysTool.name
    )
  )

  if (missingSystemTools.length > 0) {
    hasAutoPopulatedRef.current = true

    const newTools: StoredTool[] = missingSystemTools.map(tool => ({
      type: 'mcp',
      title: tool.name,
      toolId: createMcpToolId(tool.serverId, tool.name),
      params: {
        serverId: tool.serverId,
        toolName: tool.name,
        serverName: tool.serverName,
      },
      usageControl: 'auto', // Use when needed (default)
      schema: {
        ...tool.inputSchema,
        description: tool.description,
      },
      isExpanded: false,
    }))

    logger.info(`Auto-populated ${newTools.length} system MCP tools`)
    setStoreValue([...newTools, ...selectedTools])
  }
}, [systemMcpTools, systemToolsLoading, selectedTools, isPreview, setStoreValue])

// Merge system tools into availableMcpTools for the dropdown
const allAvailableMcpTools = useMemo(() => {
  // Include system tools (they're always "connected")
  const systemToolsForDropdown = systemMcpTools.map(tool => ({
    id: createMcpToolId(tool.serverId, tool.name),
    name: tool.name,
    description: tool.description,
    serverId: tool.serverId,
    serverName: tool.serverName,
    inputSchema: tool.inputSchema,
    bgColor: '#10B981', // Green for system tools
    icon: DatabaseIcon, // Use database icon
  }))

  return [...systemToolsForDropdown, ...availableMcpTools]
}, [systemMcpTools, availableMcpTools])
```

---

**5. Update MCP Service for Execution** - `apps/sim/lib/mcp/service.ts`

```typescript
// Add to executeTool method - handle system servers

async executeTool(
  userId: string,
  serverId: string,
  toolCall: McpToolCall,
  workspaceId: string
): Promise<McpToolResult> {
  // Handle system MCP servers
  if (isSystemMcpServer(serverId)) {
    return this.executeSystemMcpTool(userId, serverId, toolCall, workspaceId)
  }

  // ... existing code for user-configured servers
}

/**
 * Execute tool on system MCP server.
 * Connection is opened HERE (at execution time), not during discovery.
 */
private async executeSystemMcpTool(
  userId: string,
  serverId: string,
  toolCall: McpToolCall,
  workspaceId: string
): Promise<McpToolResult> {
  // Get connection string based on server type
  let connectionUri: string

  if (serverId === SYSTEM_MCP_SERVER_IDS.POSTGRES_AGENT) {
    const workspaceDb = await getWorkspaceDatabase(workspaceId)
    if (!workspaceDb?.neonConnectionUri) {
      throw new Error('Agent database not configured for this workspace')
    }
    connectionUri = await decrypt(workspaceDb.neonConnectionUri)
  } else if (serverId === SYSTEM_MCP_SERVER_IDS.POSTGRES_GLOBAL) {
    const globalDb = await getUserGlobalDatabase(userId)
    if (!globalDb?.neonConnectionUri) {
      throw new Error('Global database not configured for this user')
    }
    connectionUri = await decrypt(globalDb.neonConnectionUri)
  } else {
    throw new Error(`Unknown system server: ${serverId}`)
  }

  // Create stdio config for postgres-mcp
  const config: McpServerConfig = {
    id: serverId,
    name: serverId === SYSTEM_MCP_SERVER_IDS.POSTGRES_AGENT ? 'Agent Database' : 'Global Database',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres', connectionUri],
  }

  // Execute with short-lived connection
  const client = await this.createStdioClient(config)
  try {
    return await client.callTool(toolCall)
  } finally {
    await client.disconnect()
  }
}
```

---

#### Connection Flow Summary

| Phase | Action | Connection Opened? |
|-------|--------|-------------------|
| **UI Load** | Fetch system MCP tools | ❌ No (uses pre-defined schemas) |
| **Tool Selection** | User adds/removes tools | ❌ No |
| **Workflow Save** | Store tool config | ❌ No |
| **Workflow Execution** | LLM calls tool | ✅ Yes (create → use → close) |

---

#### Tasks

- [ ] Create `apps/sim/lib/mcp/system-servers.ts` - System server logic (uses cached schemas from Step 3.0.1)
- [ ] Create `apps/sim/app/api/mcp/system-tools/route.ts` - API endpoint
- [ ] Create `apps/sim/hooks/queries/system-mcp.ts` - React Query hook
- [ ] Update `apps/sim/.../tool-input.tsx` - Auto-populate system tools
- [ ] Update `apps/sim/lib/mcp/service.ts` - Handle system server execution
- [ ] Add `createStdioClient()` method for stdio transport support
- [ ] Trigger schema discovery on first database creation (in `initializeUserNeonDatabase` or `initializeWorkspaceNeonDatabase`)

---

#### User Experience

1. User creates Agent block
2. System tools are **auto-populated** (no connection opened):
   ```
   ┌─────────────────────────────────────────┐
   │ Tools                              [+]  │
   ├─────────────────────────────────────────┤
   │ 🗄️ Agent Database                       │
   │    └─ list_tables      [Auto ▾] [×]    │
   │    └─ query            [Auto ▾] [×]    │
   │    └─ execute_sql      [Auto ▾] [×]    │
   │                                         │
   │ 🗄️ Global Database                      │
   │    └─ list_tables      [Auto ▾] [×]    │
   │    └─ query            [Auto ▾] [×]    │
   │    └─ execute_sql      [Auto ▾] [×]    │
   └─────────────────────────────────────────┘
   ```

3. User can:
   - Change mode: Auto → Force → Never
   - Remove tools with [×]
   - Tools still appear in dropdown if removed

4. **Connection only opens at execution time** when LLM actually calls the tool

---

### Step 3.4: Update MCP Client for stdio Transport

**File**: `apps/sim/lib/mcp/client.ts`

**Tasks**:
- [ ] Add stdio transport support (if not already present):
  ```typescript
  // For stdio transport, spawn the process with resolved args
  if (config.transport === 'stdio') {
    // Use Node.js child_process to spawn MCP server
    // Pass resolved connection string via command args
  }
  ```

- [ ] Ensure proper process lifecycle management (spawn on connect, kill on disconnect)

---

### Step 3.5: Hide System Servers from User UI

**Files to modify**:
- [ ] `apps/sim/app/workspace/[workspaceId]/settings/` - MCP settings UI
- [ ] API routes that list MCP servers

**Tasks**:
- [ ] Filter out system-managed servers from UI list:
  ```typescript
  const userVisibleServers = servers.filter(s => !s.systemManaged)
  ```
- [ ] Show "Database Connected" indicator instead of server details
- [ ] Prevent users from editing/deleting system servers

---

### Step 3.6: postgres-mcp Configuration Details

**postgres-mcp Usage Notes**:
- Connection string format: `postgresql://user:password@host/database?sslmode=require`
- Access modes:
  - `--access-mode=unrestricted` (default) - Full CRUD + DDL
  - `--access-mode=restricted` - Read-only
- We use **unrestricted** mode for agent databases (agents need full schema control)

**Configuration for stdio transport**:
```json
{
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-postgres", "${AGENT_DB_URL}"],
  "env": {}
}
```

**Note**: The connection string is passed as a CLI argument, NOT as `DATABASE_URI` env var (simpler, more secure).

---

### Step 3.7: Testing Checklist

**Functional Tests**:
- [ ] Agent can CREATE TABLE via postgres-global MCP
- [ ] Agent can INSERT/SELECT/UPDATE/DELETE via MCP
- [ ] Agent can ALTER TABLE and DROP TABLE
- [ ] Multiple agents of same user can access Global DB
- [ ] Agent A cannot access Agent B's Agent DB
- [ ] Same agent can query both Global DB and Agent DB in one workflow

**Security Tests**:
- [ ] Connection strings never exposed to frontend (verify API responses)
- [ ] System MCP servers not visible in MCP server list UI
- [ ] `${GLOBAL_DB_URL}` reference in MCP config is resolved server-side only
- [ ] MCP tool results don't leak connection strings

---

## Phase 4: Cost Tracking & Budget Enforcement ⏸️ DEFERRED

> **Status**: DEFERRED - Implement after Phase 3 and Phase 5 are complete.
>
> **Reason**: Cost tracking complexity (Neon API rate limits, sync timing) needs more investigation.
> The 6-hour cron approach is too slow, but per-query tracking hits rate limits.
> Deferring to focus on core functionality first.
>
> **When to revisit**: After production usage patterns are understood.

<details>
<summary>Click to expand deferred Phase 4 details (for future reference)</summary>

### Overview

**Key Difference from AI Costs**:
- **AI costs**: Calculated per-request (tokens × price), updated immediately after each execution
- **DB costs**: Consumption-based (compute hours + storage), must be **periodically synced** from Neon API

**Cost Calculation Formula**:
```
DB Cost = (compute_time_seconds / 3600) × COMPUTE_PRICE_PER_CU_HOUR
        + (storage_bytes / 1e9) × STORAGE_PRICE_PER_GB_MONTH × (days_in_period / 30)
```

**Neon Consumption API**:
- Endpoint: `getConsumptionHistoryPerProject(projectId, from, to)`
- Metrics: `compute_time_seconds`, `synthetic_storage_size_bytes`, `active_time_seconds`
- Rate limit: ~30 requests/minute/account
- Reference: [Neon Consumption Metrics](https://neon.com/docs/guides/partner-consumption-metrics)

---

### Step 4.1: Cost Calculation Triggers (NEEDS INVESTIGATION)

**Question**: When should DB costs be updated?

**Options considered**:

| Trigger | Frequency | Problem |
|---------|-----------|---------|
| **Cron Job** | Every 6 hours | Too slow for accurate budget enforcement |
| **Per-workflow-end** | Real-time | Neon API rate limits (30/min) |
| **User Dashboard Load** | On demand | Only updates when user views dashboard |

**Open Questions**:
1. Can we batch consumption API calls efficiently?
2. Should we use Neon webhooks if they become available?
3. Can we estimate costs based on query patterns without API calls?

---

### Step 4.2: Create Pricing Module

**File**: `apps/sim/lib/neon/pricing.ts`

```typescript
interface NeonPricing {
  computePricePerCuHour: number  // Default: $0.16
  storagePricePerGbMonth: number // Default: $0.35
}

function getNeonPricing(): NeonPricing {
  return {
    computePricePerCuHour: parseFloat(process.env.NEON_COMPUTE_PRICE_PER_CU_HOUR || '0.16'),
    storagePricePerGbMonth: parseFloat(process.env.NEON_STORAGE_PRICE_PER_GB_MONTH || '0.35'),
  }
}

function calculateDbCost(metrics: NeonConsumptionMetrics, periodDays: number): number {
  const pricing = getNeonPricing()

  // Compute cost: CU-hours × price
  const computeHours = metrics.computeTimeSeconds / 3600
  const computeCost = computeHours * pricing.computePricePerCuHour

  // Storage cost: GB × price × (days / 30) for pro-rated monthly
  const storageGb = metrics.syntheticStorageSizeBytes / 1e9
  const storageCost = storageGb * pricing.storagePricePerGbMonth * (periodDays / 30)

  return computeCost + storageCost
}
```

**Tasks**:
- [ ] Create `getNeonPricing()` - Returns pricing from env vars
- [ ] Create `calculateDbCost(metrics, periodDays)` - Calculates cost from consumption
- [ ] Add env vars to `.env.example`:
  - `NEON_COMPUTE_PRICE_PER_CU_HOUR=0.16`
  - `NEON_STORAGE_PRICE_PER_GB_MONTH=0.35`

---

### Step 4.3: Create Consumption Tracking Module

**File**: `apps/sim/lib/neon/consumption-tracking.ts`

**Functions to implement**:

```typescript
// Fetch consumption from Neon API for a single project
async function getProjectConsumption(projectId: string, from: Date, to: Date): Promise<NeonConsumptionMetrics>

// Sync all DB costs for a user (global + all agent DBs)
async function syncUserDbConsumption(userId: string): Promise<void>

// Get total DB cost for a user (from cached values in DB)
async function getDbUsageCost(userId: string): Promise<number>

// Get detailed breakdown for UI
async function getDbUsageBreakdown(userId: string): Promise<DbUsageBreakdown>

// Pause all Neon projects when budget exceeded
async function pauseUserNeonProjects(userId: string): Promise<void>

// Resume projects when budget reset or plan upgraded
async function resumeUserNeonProjects(userId: string): Promise<void>

// Reset costs at billing period start
async function resetDbCosts(userId: string): Promise<void>
```

**Tasks**:
- [ ] Implement `getProjectConsumption()` using Neon SDK
- [ ] Implement `syncUserDbConsumption()`:
  1. Get user's global DB project ID
  2. Get all user's workspace DB project IDs
  3. Batch fetch consumption (respect rate limits)
  4. Calculate costs for each
  5. Update `current_period_cost_cents` in respective tables
  6. Sum up and update `user_db_budget.total_cost_cents`
- [ ] Implement `getDbUsageCost()` - Simple query on `user_db_budget.total_cost_cents`
- [ ] Implement `getDbUsageBreakdown()` - Returns per-DB cost details for UI
- [ ] Implement `pauseUserNeonProjects()`:
  ```typescript
  // Set quota to 0 to suspend compute
  await neonClient.updateProject(projectId, {
    settings: { quota: { active_time_seconds: 0 } }
  })
  ```
- [ ] Implement `resumeUserNeonProjects()`:
  ```typescript
  // Remove quota restriction
  await neonClient.updateProject(projectId, {
    settings: { quota: null }
  })
  ```

---

### Step 4.4: Create Cron Job for Consumption Sync

**File**: `apps/sim/app/api/cron/sync-db-consumption/route.ts`

```typescript
export async function GET(req: NextRequest) {
  // Verify cron secret
  // Get all users with active Neon databases
  // For each user (batch with rate limiting):
  //   await syncUserDbConsumption(userId)
  //   await checkUserBudget(userId)
}
```

**Tasks**:
- [ ] Create cron route with authentication
- [ ] Implement batch processing with rate limiting (max 30 Neon API calls/minute)
- [ ] Add cron schedule to deployment config (every 6 hours recommended)
- [ ] Add error handling and logging

---

### Step 4.5: Integrate with Budget Enforcement

**File to extend**: `apps/sim/lib/billing/core/budget-enforcement.ts` (or create if doesn't exist)

**Tasks**:
- [ ] Create `checkUserBudget(userId)`:
  ```typescript
  async function checkUserBudget(userId: string): Promise<BudgetStatus> {
    const aiUsage = await getAiUsageCost(userId)      // Existing
    const storageUsage = await getStorageUsageCost(userId)  // If applicable
    const dbUsage = await getDbUsageCost(userId)      // NEW

    const totalUsage = aiUsage + storageUsage + dbUsage
    const limit = await getUserBudgetLimit(userId)

    if (totalUsage >= limit) {
      await pauseUserServices(userId)
      return { exceeded: true, totalUsage, limit }
    }

    return { exceeded: false, totalUsage, limit }
  }
  ```

- [ ] Extend `pauseUserServices()` to include:
  ```typescript
  await pauseUserNeonProjects(userId)
  ```

- [ ] Update budget check in `ExecutionLogger` or pre-execution hook:
  ```typescript
  // Before workflow execution
  const budget = await checkUserBudget(userId)
  if (budget.exceeded) {
    throw new BudgetExceededError('Usage limit exceeded')
  }
  ```

---

### Step 4.6: On-Demand Refresh Trigger

**File**: `apps/sim/app/api/users/[userId]/db-usage/route.ts`

```typescript
// GET - Fetch current DB usage (triggers sync if stale)
export async function GET(req: NextRequest, { params }: { params: { userId: string } }) {
  const { userId } = params

  // Check if last sync is older than 5 minutes
  const budget = await getUserDbBudget(userId)
  const lastSync = budget?.lastSync
  const isStale = !lastSync || (Date.now() - lastSync.getTime() > 5 * 60 * 1000)

  if (isStale) {
    await syncUserDbConsumption(userId)
  }

  return NextResponse.json(await getDbUsageBreakdown(userId))
}
```

**Tasks**:
- [ ] Create API route for on-demand refresh
- [ ] Add staleness check (5-minute threshold)
- [ ] Return detailed breakdown for UI

---

### Step 4.7: Cost Breakdown API Extension

**File to extend**: `apps/sim/lib/billing/client/usage-visualization.ts`

**Tasks**:
- [ ] Add `database` field to `UsageBreakdown` interface:
  ```typescript
  interface UsageBreakdown {
    ai: { current: number; limit: number }
    storage?: { current: number; limit: number }
    database: {
      globalDb: { cost: number; computeHours: number; storageGb: number }
      agentDbs: Array<{
        workspaceId: string
        workspaceName: string
        cost: number
        computeHours: number
        storageGb: number
      }>
      total: number
    }
    total: { current: number; limit: number }
  }
  ```

- [ ] Update usage API to include DB breakdown

---

### Step 4.8: Budget Period Reset

**File to extend**: `apps/sim/lib/billing/core/usage.ts`

**Tasks**:
- [ ] In `resetUserBillingPeriod()` (or equivalent), add:
  ```typescript
  // Reset DB costs at period start
  await resetDbCosts(userId)
  ```

- [ ] Implement `resetDbCosts()`:
  1. Reset `user_db_budget.total_cost_cents` to 0
  2. Reset `user_db_budget.current_period_start` to now
  3. Reset `user_global_database.current_period_cost_cents` to 0
  4. Reset all `workspace_database.current_period_cost_cents` to 0
  5. Call `resumeUserNeonProjects(userId)` if was paused

---

### Step 4.9: Files Summary for Phase 4

| File | Purpose | Status |
|------|---------|--------|
| `apps/sim/lib/neon/pricing.ts` | Pricing configuration | NEW |
| `apps/sim/lib/neon/consumption-tracking.ts` | All consumption tracking functions | NEW |
| `apps/sim/app/api/cron/sync-db-consumption/route.ts` | Cron job for batch sync | NEW |
| `apps/sim/app/api/users/[userId]/db-usage/route.ts` | On-demand usage API | NEW |
| `apps/sim/lib/billing/core/budget-enforcement.ts` | Budget check integration | EXTEND |
| `apps/sim/lib/billing/core/usage.ts` | Period reset integration | EXTEND |
| `apps/sim/lib/billing/client/usage-visualization.ts` | UI breakdown types | EXTEND |

---

### Phase 4 Testing Checklist

- [ ] Cron job successfully syncs consumption for all users
- [ ] On-demand refresh returns fresh data
- [ ] Cost calculation matches Neon dashboard (within rounding)
- [ ] Budget exceeded triggers project pause
- [ ] Paused projects cannot execute queries (connection rejected)
- [ ] Period reset resumes paused projects
- [ ] UI shows per-DB cost breakdown
- [ ] Rate limits are respected (no 429 errors from Neon)

</details>

---

## Phase 5: Database Explorer UI

### API Routes
- [ ] `GET /api/workspaces/[workspaceId]/database/tables` - List agent DB tables
- [ ] `POST /api/workspaces/[workspaceId]/database/query` - Query agent DB
- [ ] `POST /api/workspaces/[workspaceId]/database/execute` - Execute SQL on agent DB
- [ ] `GET /api/workspaces/[workspaceId]/database/connection` - Get masked connection info
- [ ] `GET /api/users/[userId]/global-database/tables` - List global DB tables
- [ ] `POST /api/users/[userId]/global-database/query` - Query global DB

### Add Query Functions to lib/neon/
- [ ] Add `executeQuery()` to `agent-database.ts`
- [ ] Add `executeQuery()` to `global-database.ts`
- [ ] Add `listTables()` to both domain files
- [ ] Add `getSchema()` to both domain files

### Query Helpers
- [ ] Create `lib/db/queries.ts` with:
  - [ ] `getWorkspaceDatabase()`
  - [ ] `getUserGlobalDatabase()`
  - [ ] `getUserDbBudget()`
  - [ ] `getUserWorkspaceDatabases()`

### UI Components
- [ ] Create Database section in workspace settings panel
- [ ] Build TableList component
- [ ] Build TableItem component with expand/collapse
- [ ] Build TableDataViewer with pagination
- [ ] Build SQLEditor component
- [ ] Build CreateTableModal
- [ ] Add connection info display (masked, no copy button)
- [ ] Add export functionality (JSON/CSV)

### Security
- [ ] Verify user has permission to access workspace
- [ ] Sanitize table names in queries
- [ ] **Never expose raw connection strings to frontend**
- [ ] Rate limit database operations

---

## Testing Checklist

### Unit Tests
- [ ] Test Neon service functions
- [ ] Test cost calculation functions
- [ ] Test encryption/decryption utilities
- [ ] Test `getWorkspaceDatabase()` query helper
- [ ] Test `getUserGlobalDatabase()` query helper
- [ ] Test `calculateDbCost()` function
- [ ] Test budget tier functions

### Integration Tests
- [ ] Test user registration → global DB created
- [ ] Test workspace creation → agent DB created
- [ ] Test workspace deletion → agent DB deleted
- [ ] Test user deletion → global DB deleted
- [ ] Test MCP operations against real Neon DB
- [ ] Test consumption sync cron job

### Manual Testing
- [ ] Create user → verify global DB + budget record created
- [ ] Create workspace → verify agent DB created
- [ ] Delete workspace → verify Neon project deleted
- [ ] Run workflow with MCP → verify DB operations work
- [ ] Test Global DB → verify all agents can access
- [ ] Test Agent DB → verify isolation
- [ ] View tables in UI → verify schema displayed
- [ ] Execute SQL → verify results returned
- [ ] Verify connection strings never visible in UI

---

## Security Checklist

- [x] Connection URIs encrypted at rest (encryption.ts)
- [ ] Encryption key stored securely (not in code)
- [ ] MCP servers hidden from user UI
- [ ] Connection strings never returned to frontend
- [ ] API routes check authentication
- [ ] API routes check authorization (workspace ownership)
- [ ] Table names sanitized before queries
- [ ] Parameterized queries for user-provided values
- [ ] Rate limiting on database operations
- [ ] Password masked in any displayed connection strings

---

## Deployment Checklist

### Environment Variables
- [ ] Set `NEON_API_KEY` in production
- [ ] Set `NEON_CONNECTION_ENCRYPTION_KEY` in production (generate with `openssl rand -hex 32`)
- [ ] (Optional) Set org-specific API keys for Agent Plan

### Cron Jobs
- [ ] Set up cron job for `/api/cron/sync-db-consumption`
- [ ] Schedule: daily or hourly depending on needs
- [ ] Set up cron job for budget period reset (monthly)

### Monitoring
- [ ] Set up alerts for Neon API errors
- [ ] Monitor project creation success rate
- [ ] Track budget exceeded events
- [ ] Monitor consumption costs

### Documentation
- [ ] Document database feature for users
- [ ] Add troubleshooting guide
- [ ] Document Global DB vs Agent DB difference

---

## Files Created/Modified Summary

### Phase 1 Files (Complete)

| File | Purpose | Status |
|------|---------|--------|
| `packages/db/schema.ts` | 3 new tables | ✅ |
| `packages/db/migrations/0136_organic_rockslide.sql` | Migration | ✅ |
| `apps/sim/lib/neon/client.ts` | API client singleton | ✅ |
| `apps/sim/lib/neon/config.ts` | Project defaults | ✅ |
| `apps/sim/lib/neon/projects.ts` | Low-level Neon ops | ✅ |
| `apps/sim/lib/neon/agent-database.ts` | Workspace domain | ✅ |
| `apps/sim/lib/neon/global-database.ts` | User domain | ✅ |
| `apps/sim/lib/neon/types.ts` | TypeScript types | ✅ |
| `apps/sim/lib/neon/index.ts` | Barrel exports | ✅ |
| `apps/sim/lib/encryption.ts` | Encryption utility | ✅ |
| `apps/sim/.env.example` | Env var placeholders | ✅ |

### Phase 2 Files (Complete)

| File | Changes | Status |
|------|---------|--------|
| `apps/sim/lib/db/queries/user-database.ts` | User DB query helpers | ✅ |
| `apps/sim/lib/db/queries/workspace-database.ts` | Workspace DB query helpers | ✅ |
| `apps/sim/lib/db/queries/index.ts` | Barrel exports | ✅ |
| `apps/sim/lib/billing/core/usage.ts` | `handleNewUser()` + `handleUserDeletion()` | ✅ |
| `apps/sim/lib/auth/auth.ts` | User delete hook | ✅ |
| `apps/sim/app/api/workspaces/route.ts` | Agent DB on creation | ✅ |
| `apps/sim/app/api/workspaces/[id]/route.ts` | Agent DB on deletion | ✅ |

### Phase 4 Files (Pending)

| File | Purpose |
|------|---------|
| `apps/sim/lib/neon/pricing.ts` | Environment-based pricing (with TODO for future DB migration) |
| `apps/sim/lib/neon/consumption-tracking.ts` | Consumption sync, cost calculation, budget enforcement |
| `apps/sim/lib/billing/core/budget-enforcement.ts` | EXTEND to add getDbUsageCost() |
| `apps/sim/lib/billing/client/usage-visualization.ts` | EXTEND UsageBreakdown interface for DB costs |
| `apps/sim/app/api/cron/billing-sync/route.ts` | EXTEND existing cron to call syncUserDbConsumption() |

---

## Future Enhancements (YAGNI - Add Later)

### User-Owned Databases (OAuth)
- [ ] Add OAuth flow for Neon
- [ ] Add user account fields to tables
- [ ] Support `ownership_type = 'user'`

### Per-Agent Global DB Permissions
- [ ] Add `agent_global_db_permissions` table
- [ ] PostgreSQL role-based access
- [ ] Table-level restrictions

### Nice-to-Have
- [ ] Database backup/restore via Neon branches
- [ ] Schema versioning with branch snapshots
- [ ] Read replicas for heavy read workloads
- [ ] Database templates (pre-populated schemas)

### Advanced
- [ ] Multi-region support
- [ ] Usage analytics dashboard
- [ ] Custom budget configurations
