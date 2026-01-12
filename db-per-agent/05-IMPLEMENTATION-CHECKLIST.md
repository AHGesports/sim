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

## Phase 3: MCP Integration (Neon MCP Server) ✅ COMPLETE

### Overview

**Goals**:
1. Enable agents to connect to BOTH their workspace-specific DB and the user's global DB via Neon MCP
2. **Unified access** for both Sim (workflow execution) and AutomationAgentApi (AI agents)

**Key Insight**: Unlike user-configured MCP servers (stored in `mcp_servers` table), the database MCP servers are **system-managed virtual servers** that route to Neon's hosted MCP endpoint.

**Neon MCP Server**: https://github.com/neondatabase/mcp-server-neon

**Implementation Approach**:
- **Server-Level Display**: UI shows 2 server entries ("Agent Database MCP", "Globally Shared Database MCP") instead of individual tools
- **Server Expansion**: At execution time, server entries expand to individual tools for the LLM
- **Project ID Injection**: Tool calls automatically include the correct `project_id` based on server type

---

### Architecture: Neon MCP Server (HTTP Transport)

**Key Design Decision**: Use Neon's hosted MCP server (`https://mcp.neon.tech/mcp`) instead of self-hosted postgres-mcp. This provides:
- ✅ Serverless compatibility (works on Vercel/Railway)
- ✅ Multi-tenant via `project_id` routing (single endpoint serves all databases)
- ✅ Zero deployment/maintenance (Neon hosts it)
- ✅ Native Neon integration

**Flow for Workflow Execution**:
```
Agent Block in Workflow
    │
    ├── UI shows 2 server entries: "Agent Database MCP", "Globally Shared Database MCP"
    ├── User selects servers (auto-added on first load)
    │
    ▼
Workflow Execution
    │
    ├── Agent handler expands server entries → individual tools (run_sql, list_tables, etc.)
    ├── LLM decides which tool to call
    │
    ▼
Tool Execution (POST /api/mcp/tools/execute)
    │
    ├── Checks isSystemMcpServerId() → routes to executeSystemMcpTool()
    ├── Gets project_id from workspace_database or user_global_database
    ├── Creates HTTP client to https://mcp.neon.tech/mcp
    ├── Injects project_id into tool arguments
    ├── Executes tool via Neon MCP
    └── Returns result to workflow
```

**Flow for AutomationAgentApi**:
```
AutomationAgentApi (external service)
    │
    ├── 1. Call Sim API: GET /api/mcp/system-tools?workspaceId=X
    │      Returns: { tools: [...], servers: [...] }
    │
    ▼
AI Agent decides to call a tool
    │
    ├── 2. Call Sim API: POST /api/mcp/tools/execute
    │      Body: { serverId: "system:postgres-agent", toolName: "run_sql", arguments: { sql: "..." } }
    │
    ▼
Sim handles execution (same as workflow execution)
```

**Environment Variables**:
```env
NEON_API_KEY=neon_api_key_here  # Used for both project creation AND MCP auth
```

---

### Step 3.1: System Server Configuration ✅

**System Server IDs** (defined in `types.ts`):
```typescript
export const SYSTEM_MCP_SERVER_IDS = {
  POSTGRES_AGENT: 'system:postgres-agent',
  POSTGRES_GLOBAL: 'system:postgres-global',
} as const
```

**Neon MCP Configuration** (defined in `types.ts`):
```typescript
export const NEON_MCP_CONFIG = {
  url: 'https://mcp.neon.tech/mcp',  // Streamable HTTP endpoint (POST-based)
  timeout: 30000,
  retries: 3,
} as const
```

**Allowed Tools** (SQL only, defined in `types.ts`):
```typescript
export const NEON_MCP_ALLOWED_TOOLS = [
  'run_sql',
  'run_sql_transaction',
  'list_tables',
  'describe_table_schema',
] as const
```

**Excluded Tools** (for security):
- Project management (list_projects, create_project, delete_project)
- Branching (create_branch, delete_branch, compare_schemas)
- Migrations (prepare_migration, complete_migration)
- Connection string retrieval (get_connection_string)

---

### Step 3.2: Tool Schema Caching ✅

**Database table** (`mcp_tool_schema_cache`):
```sql
CREATE TABLE mcp_tool_schema_cache (
  id TEXT PRIMARY KEY,
  server_type TEXT NOT NULL,  -- 'postgres-agent' | 'postgres-global'
  tool_name TEXT NOT NULL,
  tool_schema JSONB NOT NULL,
  discovered_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(server_type, tool_name)
);
```

**Discovery Flow**:
```
getSystemMcpServers() called
    │
    ├── Check mcp_tool_schema_cache table
    │   ├── Cache exists → Return cached schemas (NO HTTP call)
    │   └── Cache empty → Trigger discovery
    │
    ├── Connect to https://mcp.neon.tech/mcp via HTTP
    ├── Call listTools() → get all Neon MCP tools
    ├── Filter to NEON_MCP_ALLOWED_TOOLS only
    ├── Cache filtered schemas in DB
    │
    └── Return tool schemas
```

**Files**:
- `apps/sim/lib/mcp/system-tool-cache.ts` - Cache management functions
- `apps/sim/lib/mcp/system-servers.ts` - `discoverAndCacheToolSchemas()` function

---

### Step 3.3: System Server Implementation ✅

**File**: `apps/sim/lib/mcp/system-servers.ts`

**Key Functions**:

```typescript
/**
 * Get system MCP servers available for a workspace.
 * Returns virtual server configs with tools from cached schemas.
 */
export async function getSystemMcpServers(
  userId: string,
  workspaceId: string
): Promise<SystemMcpServer[]>

/**
 * Execute a tool on a system MCP server.
 * Connects to Neon MCP via HTTP and injects project_id.
 */
export async function executeSystemMcpTool(
  userId: string,
  workspaceId: string,
  serverId: SystemMcpServerId,
  toolCall: McpToolCall
): Promise<McpToolResult>

/**
 * Discover and cache tool schemas from Neon MCP.
 * Called once (triggered on first database creation).
 */
export async function discoverAndCacheToolSchemas(
  projectId: string,
  force?: boolean
): Promise<void>
```

**Project ID Injection**:
```typescript
// In executeSystemMcpTool()
const toolCallWithProject: McpToolCall = {
  name: toolCall.name,
  arguments: {
    ...toolCall.arguments,
    project_id: projectId,  // Injected based on server type
  },
}
```

| Server ID | Project ID Source |
|-----------|------------------|
| `system:postgres-agent` | `workspace_database.neon_project_id` |
| `system:postgres-global` | `user_global_database.neon_project_id` |

---

### Step 3.4: API Endpoints ✅

**GET /api/mcp/system-tools**

Returns system MCP servers and their tools for a workspace.

```typescript
// Response
{
  "success": true,
  "data": {
    "tools": [...],    // Individual tools (for LLM)
    "servers": [...]   // Server configs (for UI grouping)
  }
}
```

**POST /api/mcp/tools/execute**

Executes MCP tool. Routes to system server handler when `serverId.startsWith('system:')`.

```typescript
// Request
{
  "serverId": "system:postgres-agent",
  "toolName": "run_sql",
  "arguments": { "sql": "SELECT * FROM users" },
  "workspaceId": "..."
}
```

---

### Step 3.5: UI Implementation ✅

**Server-Level Display** (not individual tools):

The UI shows **2 server entries** instead of 6 individual tools:
- **Agent Database MCP** - Brand primary color (`var(--brand-primary-hex)`)
- **Globally Shared Database MCP** - Blue (`#3B82F6`)

**File**: `apps/sim/.../tool-input.tsx`

**Key Changes**:
1. Added `useSystemMcpServers()` hook to fetch servers
2. Changed dropdown to show servers, not individual tools
3. Auto-populates server entries on first load
4. Validation skips system servers (always "connected")
5. Server entries stored with `isSystemServer: 'true'` flag

**Storage Format** (server entry):
```typescript
{
  type: 'mcp',
  title: 'Agent Database MCP',
  toolId: 'system:postgres-agent',
  params: {
    serverId: 'system:postgres-agent',
    serverName: 'Agent Database MCP',
    isSystemServer: 'true',  // Flag for server-level entry
  },
  usageControl: 'auto',
}
```

---

### Step 3.6: Agent Handler Updates ✅

**File**: `apps/sim/executor/handlers/agent/agent-handler.ts`

**Key Changes**:

1. **System servers always available**:
```typescript
// In filterUnavailableMcpTools()
const systemServerIds = serverIds.filter((id) => id.startsWith('system:'))
const availableServerIds = new Set<string>(systemServerIds)  // Always included
```

2. **Server entry expansion**:
```typescript
// In expandSystemServerEntries()
// Server entries (isSystemServer: 'true') are expanded to individual tools
// at execution time by fetching tools from getSystemMcpServers()

// Input: { serverId: 'system:postgres-agent', isSystemServer: 'true' }
// Output: [
//   { serverId: 'system:postgres-agent', toolName: 'run_sql', ... },
//   { serverId: 'system:postgres-agent', toolName: 'list_tables', ... },
//   { serverId: 'system:postgres-agent', toolName: 'describe_table_schema', ... },
//   { serverId: 'system:postgres-agent', toolName: 'run_sql_transaction', ... },
// ]
```

---

### Step 3.7: React Query Hooks ✅

**File**: `apps/sim/hooks/queries/system-mcp.ts`

```typescript
// Fetch system MCP tools (individual tools)
export function useSystemMcpTools(workspaceId: string)

// Fetch system MCP servers (for UI grouping)
export function useSystemMcpServers(workspaceId: string)
```

Both hooks share the same query key and fetch function to avoid duplicate API calls.

---

### Step 3.8: Testing Checklist

**Functional Tests**:
- [ ] Agent can CREATE TABLE via run_sql tool
- [ ] Agent can INSERT/SELECT/UPDATE/DELETE via MCP
- [ ] Agent can ALTER TABLE and DROP TABLE
- [ ] Multiple agents of same user can access Global DB
- [ ] Agent A cannot access Agent B's Agent DB
- [ ] Same agent can query both Global DB and Agent DB in one workflow

**Security Tests**:
- [ ] Connection strings never exposed to frontend (verify API responses)
- [ ] System MCP servers not visible in MCP server list UI
- [ ] Project ID injection works correctly (each database routes to correct Neon project)
- [ ] MCP tool results don't leak connection strings

---

### Phase 3 Implementation Summary

**Status**: ✅ COMPLETE

**Architecture**:
- Uses Neon's hosted MCP server at `https://mcp.neon.tech/mcp`
- Server-level UI display (2 entries: "Agent Database MCP", "Globally Shared Database MCP")
- Server entries expand to individual tools at execution time
- Project ID injection routes tool calls to correct Neon project
- Tool schemas cached in `mcp_tool_schema_cache` table (one-time discovery)

**Files Created/Modified**:
| File | Purpose | Status |
|------|---------|--------|
| `packages/db/schema.ts` | Added `mcpToolSchemaCache` table | ✅ |
| `packages/db/migrations/0136_workable_devos.sql` | Migration file | ✅ |
| `apps/sim/lib/mcp/types.ts` | System server types, `NEON_MCP_CONFIG`, `SYSTEM_MCP_SERVER_IDS`, `NEON_MCP_ALLOWED_TOOLS` | ✅ |
| `apps/sim/lib/mcp/system-tool-cache.ts` | Cache management for tool schemas | ✅ |
| `apps/sim/lib/mcp/system-servers.ts` | System server logic + tool execution via Neon MCP | ✅ |
| `apps/sim/app/api/mcp/system-tools/route.ts` | API endpoint returning tools and servers | ✅ |
| `apps/sim/app/api/mcp/tools/execute/route.ts` | Routes system server calls to executeSystemMcpTool() | ✅ |
| `apps/sim/hooks/queries/system-mcp.ts` | `useSystemMcpTools()` and `useSystemMcpServers()` hooks | ✅ |
| `apps/sim/.../tool-input.tsx` | Server-level display, auto-populate, validation skip | ✅ |
| `apps/sim/executor/handlers/agent/agent-handler.ts` | `expandSystemServerEntries()`, system servers always available | ✅ |

**Key Implementation Details**:

1. **Server-Level Display**: UI shows 2 server entries instead of 6 individual tools. This is cleaner and more intuitive.

2. **Server Expansion**: At execution time, server entries (with `isSystemServer: 'true'`) are expanded to individual tools by `agent-handler.ts`.

3. **Project ID Injection**: `executeSystemMcpTool()` automatically injects `project_id` based on server type:
   - `system:postgres-agent` → `workspace_database.neon_project_id`
   - `system:postgres-global` → `user_global_database.neon_project_id`

4. **Validation Skip**: System servers are always "connected" (virtual servers), so validation is skipped.

5. **Shared Query Key**: Both `useSystemMcpTools()` and `useSystemMcpServers()` share the same query key to avoid duplicate API calls.

**Deleted** (no longer needed):
- `apps/sim/lib/mcp/stdio-client.ts` - Was for postgres-mcp-pro stdio transport

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

### Phase 3 Files (Complete)

| File | Purpose | Status |
|------|---------|--------|
| `packages/db/schema.ts` | Added `mcpToolSchemaCache` table | ✅ |
| `packages/db/migrations/0136_workable_devos.sql` | Migration for cache table | ✅ |
| `apps/sim/lib/mcp/types.ts` | `NEON_MCP_CONFIG`, `SYSTEM_MCP_SERVER_IDS`, `NEON_MCP_ALLOWED_TOOLS`, type definitions | ✅ |
| `apps/sim/lib/mcp/system-tool-cache.ts` | `getCachedToolSchemas()`, `cacheToolSchemas()`, `hasCachedSchemas()`, `clearCachedSchemas()` | ✅ |
| `apps/sim/lib/mcp/system-servers.ts` | `getSystemMcpServers()`, `executeSystemMcpTool()`, `discoverAndCacheToolSchemas()` | ✅ |
| `apps/sim/app/api/mcp/system-tools/route.ts` | API endpoint returning tools and servers for workspace | ✅ |
| `apps/sim/app/api/mcp/tools/execute/route.ts` | Routes system server calls to `executeSystemMcpTool()` | ✅ |
| `apps/sim/hooks/queries/system-mcp.ts` | `useSystemMcpTools()`, `useSystemMcpServers()` hooks | ✅ |
| `apps/sim/.../tool-input.tsx` | Server-level display, auto-populate, validation skip for system servers | ✅ |
| `apps/sim/executor/handlers/agent/agent-handler.ts` | `expandSystemServerEntries()`, system servers always available | ✅ |

**Deleted**: `apps/sim/lib/mcp/stdio-client.ts` (replaced by Neon MCP HTTP transport)

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
