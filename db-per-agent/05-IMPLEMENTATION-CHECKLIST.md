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

## Phase 2: Sim Integration (Lifecycle Hooks)

### On User Registration
**File**: `apps/sim/lib/auth/auth.ts` - `handleNewUser()`
- [ ] Call `createUserGlobalDatabase(userId)` to create global DB
- [ ] Insert record into `user_global_database` table with:
  - `neonProjectId` from result
  - `neonConnectionUri` encrypted
  - `neonBranchId` from result
- [ ] Insert record into `user_db_budget` table (default 'free' tier)
- [ ] Store `GLOBAL_DB_URL` in user environment variables
- [ ] Fail registration if global DB creation fails

### On Workspace Create
**File**: `apps/sim/app/api/workspaces/route.ts`
- [ ] Call `createAgentDatabase(workspaceId)` after workspace created
- [ ] Insert record into `workspace_database` table with:
  - `neonProjectId` from result
  - `neonConnectionUri` encrypted
  - `neonBranchId` from result
- [ ] Store `AGENT_DB_URL` in workspace environment variables
- [ ] Handle creation failures gracefully

### On Workspace Delete
**File**: `apps/sim/app/api/workspaces/[id]/route.ts`
- [ ] Look up `workspace_database` record by workspaceId
- [ ] Check `ownership_type` before deleting Neon project
- [ ] Call `deleteNeonProject(projectId)` for platform-owned DBs
- [ ] CASCADE handles `workspace_database` record deletion

### On User Delete
- [ ] Look up `user_global_database` record by userId
- [ ] Call `deleteNeonProject(projectId)` for global DB
- [ ] CASCADE handles `user_global_database` and `user_db_budget` deletion
- [ ] Workspace deletions cascade and trigger their own DB deletions

### On Tier Change
- [ ] Budget tier is derived from user's subscription (no DB update needed)
- [ ] If upgrading from exceeded state, resume paused projects
- [ ] No need to update Neon settings (cost-budget model)

---

## Phase 3: MCP Integration

### Environment Variable Pattern
- [ ] Configure MCP servers to use env var references:
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
- [ ] Update `getEffectiveDecryptedEnv()` to include DB URLs
- [ ] Ensure MCP servers are hidden from user UI
- [ ] Connection string resolution happens only server-side

### Testing
- [ ] Test agent can CREATE TABLE via postgres-global MCP
- [ ] Test agent can INSERT/SELECT/UPDATE/DELETE via MCP
- [ ] Test agent can ALTER TABLE and DROP TABLE
- [ ] Verify Global DB is accessible by all user's agents
- [ ] Verify Agent DB is isolated (Agent A can't access Agent B's data)
- [ ] Verify connection strings never exposed to frontend

---

## Phase 4: Cost Tracking & Budget Enforcement

### Add Files to lib/neon/
- [ ] Add `pricing.ts` - Environment-based pricing (getNeonPricing, calculateDbCost)
  - Uses `NEON_COMPUTE_PRICE_PER_CU_HOUR` env var (default 0.16)
  - Uses `NEON_STORAGE_PRICE_PER_GB_MONTH` env var (default 0.35)
  - TODO comment: Future migration to database-stored pricing
- [ ] Add `consumption-tracking.ts` - Consumption sync and cost tracking functions
  - syncUserDbConsumption() - syncs all DBs for a user
  - getDbUsageCost() - gets total DB cost for budget enforcement
  - pauseUserNeonProjects() - sets quota to 0 when budget exceeded
  - resumeUserNeonProjects() - restores quota when budget reset
  - getDbUsageBreakdown() - returns cost breakdown for UI

### Consumption Sync
- [ ] Extend existing `app/api/cron/billing-sync/route.ts` to call `syncUserDbConsumption()`
- [ ] Implement `syncUserDbConsumption()` in `lib/neon/consumption-tracking.ts`:
  - Fetch consumption from Neon API for all user's projects (global + agents)
  - Calculate costs using `calculateDbCost()` from `lib/neon/pricing.ts`
  - Update `current_period_cost_cents` on `user_global_database` table
  - Update `current_period_cost_cents` on `workspace_database` table
  - Update `total_cost_cents` on `user_db_budget` table
  - Call `checkTotalUserBudget()` for unified budget enforcement (AI + Storage + DB)

### Budget Enforcement
- [ ] Extend `lib/billing/core/budget-enforcement.ts`:
  - Add `getDbUsageCost(userId)` to get total DB costs
  - Update `checkTotalUserBudget()` to include DB costs in total
  - Call `pauseUserServices()` when AI + Storage + DB >= limit
- [ ] Implement `pauseUserNeonProjects()` in `lib/neon/consumption-tracking.ts`:
  - Set quota to 0 on all user's Neon projects (global + agents)
- [ ] Implement `resumeUserNeonProjects()` in `lib/neon/consumption-tracking.ts`:
  - Restore quota on budget reset or plan upgrade
- [ ] Handle budget exceeded state in UI with breakdown

### Cost Breakdown API
- [ ] Extend `lib/billing/client/usage-visualization.ts`:
  - Add `database` field to `UsageBreakdown` interface
  - Include global DB cost breakdown
  - Include all agent DB costs with workspace names
  - Total DB costs rolled up into unified budget view
- [ ] Extend `GET /api/v1/users/[userId]/usage` to include DB breakdown
- [ ] Budget shows: AI + Storage + Database = Total (vs plan limit)

### UI Components
- [ ] Database usage dashboard
- [ ] Per-agent cost breakdown table
- [ ] Budget exceeded warning
- [ ] Upgrade plan CTA

### Budget Period Reset
- [ ] Extend `lib/billing/core/usage.ts` `resetUserBillingPeriod()`:
  - Call `resetDbCosts(userId)` from `lib/neon/consumption-tracking.ts`
- [ ] Implement `resetDbCosts()`:
  - Reset `user_db_budget` period start and total cost
  - Reset `current_period_cost_cents` on `user_global_database`
  - Reset `current_period_cost_cents` on all `workspace_database` records
  - Resume paused projects via `resumeUserNeonProjects()`

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

### Phase 2 Files (Pending)

| File | Changes |
|------|---------|
| `apps/sim/lib/auth/auth.ts` | Global DB on registration |
| `apps/sim/app/api/workspaces/route.ts` | Agent DB on creation |
| `apps/sim/app/api/workspaces/[id]/route.ts` | Agent DB on deletion |
| `apps/sim/lib/environment/utils.ts` | Env var helpers |

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
