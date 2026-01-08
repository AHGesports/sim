# Cost Tracking & Budget Enforcement

## DRY Integration with Existing Billing

**This document integrates with `lib/billing/` (NOT a separate system):**
- ✅ Uses existing plan tiers (`lib/billing/plans.ts`)
- ✅ Uses existing budget limits (`lib/billing/constants.ts`)
- ✅ Uses existing billing periods (Stripe subscription cycles)
- ✅ Extends existing usage API (`lib/billing/client/usage-visualization.ts`)
- ✅ Integrates with existing cron (`app/api/cron/billing-sync/route.ts`)
- ✅ Follows existing patterns (`lib/billing/storage/tracking.ts`)

**New files to create:**
- `lib/neon/consumption-tracking.ts` - DB cost sync (follows `lib/billing/storage/tracking.ts` pattern)
- `lib/neon/pricing.ts` - Neon pricing constants and cost calculation

**Files to extend:**
- `lib/billing/core/budget-enforcement.ts` - Add `getDbUsageCost()` to total budget check
- `lib/billing/client/usage-visualization.ts` - Add DB breakdown to UsageBreakdown interface

## Overview

Instead of hard resource quotas, we use a **cost-budget model**:

1. **Create with autoscaling** - no hard limits, flexible resource usage
2. **Track consumption** - via Neon Consumption API
3. **Calculate cost** - using Neon's pricing
4. **Enforce budget** - when cost reaches user's limit

**Benefits**:
- User A can have high-storage, low-compute DB
- User B can have low-storage, high-compute DB
- Both stay under their budget (e.g., $2/month)

---

## Budget Scope

**Budget is per USER, not per database.**

A user's budget covers ALL their databases:
- Global DB
- All agent DBs (workspaces)

```
User Budget ($2/month)
├── Global DB cost: $0.45
├── Agent A (Sales Bot) cost: $0.82
├── Agent B (Support AI) cost: $0.23
└── Agent C (Data Sync) cost: $0.50
────────────────────────────────
TOTAL: $2.00 (100% of budget)
```

---

## Budget Limits

**Uses existing plan limits** (`lib/billing/constants.ts` - unchanged):

```typescript
export const DEFAULT_FREE_CREDITS = 20        // $20/month TOTAL (AI + Storage + DB)
export const DEFAULT_PRO_TIER_COST_LIMIT = 20
export const DEFAULT_TEAM_TIER_COST_LIMIT = 40
export const DEFAULT_ENTERPRISE_TIER_COST_LIMIT = 200
```

**DB costs count toward the same overall limit:**
- Free: $20/month total → user can use $15 AI + $3 Storage + $2 DB (or any combination)
- Pro: $20/month total → user can use $10 AI + $5 Storage + $5 DB (or any combination)
- Budget enforcement triggers when **AI + Storage + DB ≥ limit**

---

## Neon Consumption Metrics (NOT Costs)

**IMPORTANT**: Neon's API returns **raw consumption metrics only**, NOT dollar costs.

Neon does NOT provide:
- ❌ Cost calculation API endpoints
- ❌ Current pricing rates via API
- ❌ Dollar amounts in consumption responses

**What Neon provides**:
```typescript
// Response from GET /v2/consumption_history/projects
interface NeonConsumptionMetrics {
  active_time_seconds: number           // Compute active time
  compute_time_seconds: number          // CPU seconds used
  written_data_bytes: number            // Data written
  synthetic_storage_size_bytes: number  // Storage size
}
```

---

## Schema

### User-Level Budget

```sql
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

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP,

  UNIQUE(user_id)
);
```

### Per-Project Tracking

Both `user_global_database` and `workspace_database` have:

```sql
-- Per-project consumption tracking
current_period_cost_cents INTEGER DEFAULT 0,
last_consumption_sync TIMESTAMP,
```

---

## Cost Calculation Approach

Since Neon doesn't provide cost calculation APIs, we use **environment-based pricing**:

```typescript
// lib/neon/pricing.ts
export function getNeonPricing() {
  return {
    // Default to current Neon pricing (as of 2025)
    // TODO: Future enhancement - migrate to database-stored pricing with admin UI
    // This would allow runtime updates without redeploy and better audit trail
    computePerCuHour: parseFloat(
      process.env.NEON_COMPUTE_PRICE_PER_CU_HOUR ?? '0.16'
    ),
    storagePerGbMonth: parseFloat(
      process.env.NEON_STORAGE_PRICE_PER_GB_MONTH ?? '0.35'
    ),
  };
}

export function calculateDbCost(metrics: NeonConsumptionMetrics): number {
  const pricing = getNeonPricing();
  const computeCost = (metrics.compute_time_seconds / 3600) * pricing.computePerCuHour;
  const storageCost = (metrics.synthetic_storage_size_bytes / 1e9) * pricing.storagePerGbMonth;
  return computeCost + storageCost;
}
```

**Environment variables to add to `.env.example`:**
```bash
# Neon pricing (as of 2025-01 - update when Neon changes rates)
# TODO: Future enhancement - migrate to database-stored pricing for runtime updates
NEON_COMPUTE_PRICE_PER_CU_HOUR=0.16
NEON_STORAGE_PRICE_PER_GB_MONTH=0.35
```

**Why environment variables now:**
- Simple to implement and maintain
- No additional database schema needed
- Updates don't require code changes (just env var update + restart)
- Works well for current scale

**TODO - Future migration path:**
When we need more sophisticated pricing management, migrate to database-stored pricing:
- Create `neon_pricing` table with version history
- Add admin UI for updating pricing
- Support multiple pricing tiers or regional pricing
- Better audit trail for pricing changes
- No restart required for pricing updates

---

## Consumption Sync Flow

**Integrates with existing billing cron** (`app/api/cron/billing-sync/route.ts`):

### Cron Job

```typescript
// app/api/cron/billing-sync/route.ts (EXTEND EXISTING)
export async function GET(req: Request) {
  // Existing: Sync Stripe usage, AI costs, storage, etc.

  // NEW: Sync DB consumption
  const users = await getUsersWithDatabases();
  for (const user of users) {
    await syncUserDbConsumption(user.id);
  }

  return Response.json({ success: true });
}

// lib/neon/consumption-tracking.ts (follows lib/billing/storage/tracking.ts pattern)
async function syncUserDbConsumption(userId: string) {
  let totalCost = 0;

  // 1. Sync global DB consumption
  const globalDb = await getUserGlobalDatabase(userId);
  if (globalDb?.neonProjectId) {
    const consumption = await neonApi.getProjectConsumption(globalDb.neonProjectId);
    const cost = calculateDbCost(consumption);
    totalCost += cost;

    await db.update(userGlobalDatabase)
      .set({
        currentPeriodCostCents: Math.round(cost * 100),
        lastConsumptionSync: new Date(),
      })
      .where(eq(userGlobalDatabase.userId, userId));
  }

  // 2. Sync all agent DB consumption
  const agentDbs = await getUserWorkspaceDatabases(userId);
  for (const agentDb of agentDbs) {
    if (agentDb.neonProjectId) {
      const consumption = await neonApi.getProjectConsumption(agentDb.neonProjectId);
      const cost = calculateDbCost(consumption);
      totalCost += cost;

      await db.update(workspaceDatabase)
        .set({
          currentPeriodCostCents: Math.round(cost * 100),
          lastConsumptionSync: new Date(),
        })
        .where(eq(workspaceDatabase.id, agentDb.id));
    }
  }

  // 3. Update user DB budget tracking
  const totalCostCents = Math.round(totalCost * 100);

  await db.update(userDbBudget)
    .set({
      totalCostCents,
      lastSync: new Date(),
    })
    .where(eq(userDbBudget.userId, userId));

  // 4. Check TOTAL user budget (AI + Storage + DB)
  await checkTotalUserBudget(userId);  // Uses lib/billing/core/budget-enforcement.ts
}
```

---

## Budget Enforcement

**Unified budget enforcement** via `lib/billing/core/budget-enforcement.ts`:

```typescript
// lib/billing/core/budget-enforcement.ts (EXTEND EXISTING)
export async function checkTotalUserBudget(userId: string): Promise<void> {
  const [aiCost, storageCost, dbCost] = await Promise.all([
    getAiUsageCost(userId),
    getStorageUsageCost(userId),
    getDbUsageCost(userId),  // NEW
  ])

  const totalCost = aiCost + storageCost + dbCost
  const limit = await getUserLimit(userId)

  if (totalCost >= limit) {
    // Pause ALL services (not just DB)
    await pauseUserServices(userId)
  }
}

// lib/neon/consumption-tracking.ts
async function pauseUserNeonProjects(userId: string) {
  const globalDb = await getUserGlobalDatabase(userId);
  const agentDbs = await getUserWorkspaceDatabases(userId);

  const projectIds = [
    globalDb?.neonProjectId,
    ...agentDbs.map(db => db.neonProjectId)
  ].filter(Boolean);

  // Set quota to 0 on all projects (pauses compute)
  for (const projectId of projectIds) {
    await neonApi.updateProject(projectId, {
      project: {
        settings: {
          quota: {
            active_time_seconds: 0,
          },
        },
      },
    });
  }
}
```

**User sees**: "You've reached your usage limit (AI: $X, Storage: $Y, Database: $Z). Upgrade or wait for next period."

---

## Cost Breakdown API

**Extends existing usage API** (`lib/billing/client/usage-visualization.ts`):

```typescript
// lib/billing/client/usage-visualization.ts (EXTEND EXISTING)
export interface UsageBreakdown {
  // Existing
  ai: number
  storage: number
  executions: number

  // NEW: DB breakdown
  database: {
    total: number
    global?: { name: string; costCents: number }
    agents: Array<{ workspaceId: string; name: string; costCents: number }>
  }
}

// GET /api/v1/users/[userId]/usage (EXTEND EXISTING)
export async function GET(req: Request, { params }: { params: { userId: string } }) {
  const usage = await getUserUsageData(params.userId);  // Existing

  // NEW: Add DB breakdown
  const dbBreakdown = await getDbUsageBreakdown(params.userId);

  return Response.json({
    ...usage,
    database: dbBreakdown,
  });
}

// lib/neon/consumption-tracking.ts
export async function getDbUsageBreakdown(userId: string) {
  const globalDb = await getUserGlobalDatabase(userId);
  const agentDbs = await getUserWorkspaceDatabases(userId);

  const agents = [];
  for (const agentDb of agentDbs) {
    const workspace = await getWorkspace(agentDb.workspaceId);
    agents.push({
      workspaceId: agentDb.workspaceId,
      name: workspace?.name ?? 'Unknown Agent',
      costCents: agentDb.currentPeriodCostCents ?? 0,
    });
  }

  return {
    total: (globalDb?.currentPeriodCostCents ?? 0) +
           agents.reduce((sum, a) => sum + a.costCents, 0),
    global: globalDb ? {
      name: 'Global DB',
      costCents: globalDb.currentPeriodCostCents ?? 0
    } : undefined,
    agents,
  };
}
```

### Response Example

```json
{
  "plan": "pro",
  "limitCents": 2000,
  "usedCents": 1750,
  "percentUsed": 87.5,
  "status": "warning",
  "periodStart": "2024-01-01T00:00:00Z",
  "periodEnd": "2024-02-01T00:00:00Z",
  "breakdown": {
    "ai": { "costCents": 1230, "percent": 61.5 },
    "storage": { "costCents": 320, "percent": 16.0 },
    "database": {
      "costCents": 200,
      "percent": 10.0,
      "global": { "name": "Global DB", "costCents": 45 },
      "agents": [
        { "workspaceId": "ws-123", "name": "Sales Bot", "costCents": 82 },
        { "workspaceId": "ws-456", "name": "Support AI", "costCents": 23 },
        { "workspaceId": "ws-789", "name": "Data Sync", "costCents": 50 }
      ]
    }
  }
}
```

---

## UI Display

**Unified usage dashboard** (extends existing UI):

```
User Dashboard - Usage Breakdown
──────────────────────────────────────────────────────
Overall Budget: $17.50 / $20.00 (87.5%)  [Pro Plan]

| Category           | This Month | % of Budget      |
|--------------------|------------|------------------|
| AI Usage           | $12.30     | 61.5%            |
| Storage            | $3.20      | 16.0%            |
| Database           | $2.00      | 10.0%            |
│  ├─ Global DB      | $0.45      |  2.25%           |
│  ├─ Sales Bot      | $0.82      |  4.1%            |
│  ├─ Support AI     | $0.23      |  1.15%           |
│  └─ Data Sync      | $0.50      |  2.5%            |
──────────────────────────────────────────────────────
| TOTAL              | $17.50     | 87.5% of $20     |
──────────────────────────────────────────────────────

⚠️ You're approaching your limit
[Upgrade to Team] for $40/month budget
```

**Existing usage visualization** (`lib/billing/client/usage-visualization.ts`) extended with DB breakdown

---

## Project Creation (Autoscaling)

No hard quotas - autoscaling handles resources:

```typescript
await apiClient.createProject({
  project: {
    name: `workspace-${workspaceId}`,
    pg_version: 17,
    region_id: 'aws-us-east-1',
    // NO hard quotas - autoscaling handles resources
    default_endpoint_settings: {
      autoscaling_limit_min_cu: 0.25,  // Scale to zero
      autoscaling_limit_max_cu: 2,     // Max 2 CU when active
      suspend_timeout_seconds: 60,     // Aggressive scale-to-zero
    },
  },
});
```

---

## Budget Period Reset

**Uses existing billing period** (tied to Stripe subscription):

```typescript
// lib/billing/core/usage.ts (EXTEND EXISTING)
// Existing billing period reset already handles AI + Storage costs
// Just need to add DB cost reset

export async function resetUserBillingPeriod(userId: string) {
  // Existing: Reset AI costs, storage costs, etc.

  // NEW: Reset DB costs
  await resetDbCosts(userId);
}

// lib/neon/consumption-tracking.ts
export async function resetDbCosts(userId: string) {
  // Reset user DB budget
  await db.update(userDbBudget)
    .set({
      currentPeriodStart: new Date(),
      totalCostCents: 0,
      lastSync: null,
    })
    .where(eq(userDbBudget.userId, userId));

  // Reset global DB tracking
  await db.update(userGlobalDatabase)
    .set({ currentPeriodCostCents: 0, lastConsumptionSync: null })
    .where(eq(userGlobalDatabase.userId, userId));

  // Reset agent DB tracking
  const workspaces = await getUserWorkspaces(userId);
  for (const ws of workspaces) {
    await db.update(workspaceDatabase)
      .set({ currentPeriodCostCents: 0, lastConsumptionSync: null })
      .where(eq(workspaceDatabase.workspaceId, ws.id));
  }

  // Resume paused projects if previously exceeded
  await resumeUserNeonProjects(userId);
}
```

---

## Neon Consumption API

```typescript
// lib/neon/service.ts
import { createApiClient } from '@neondatabase/api-client';

const apiClient = createApiClient({
  apiKey: process.env.NEON_API_KEY!,
});

export async function getProjectConsumption(projectId: string): Promise<NeonConsumption> {
  const response = await apiClient.getProjectConsumption(projectId, {
    from: getCurrentPeriodStart(),
    to: new Date().toISOString(),
  });

  return {
    compute_time_seconds: response.data.compute_time_seconds ?? 0,
    synthetic_storage_size_bytes: response.data.synthetic_storage_size_bytes ?? 0,
    data_transfer_bytes: response.data.data_transfer_bytes ?? 0,
  };
}
```
