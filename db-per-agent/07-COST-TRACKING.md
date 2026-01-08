# Cost Tracking & Budget Enforcement

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

## Budget Tiers

```typescript
// lib/neon/budgets.ts
export const USER_DB_BUDGETS = {
  // TOTAL budget per user (covers global DB + ALL agent DBs combined)
  free: 2.00,       // $2/month total for free users
  paid: 20.00,      // $20/month total for paid users
  enterprise: 100.00,  // $100/month for enterprise
} as const;
```

---

## Neon Pricing

```typescript
// lib/neon/pricing.ts
export const NEON_PRICING = {
  // Scale plan pricing (approximate)
  compute_per_cu_hour: 0.16,      // $0.16 per CU-hour
  storage_per_gb_month: 0.024,    // $0.024 per GB-month
  data_transfer_per_gb: 0.09,     // $0.09 per GB
} as const;
```

---

## Schema

### User-Level Budget

```sql
CREATE TABLE user_db_budget (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,

  -- Budget configuration
  budget_tier TEXT NOT NULL DEFAULT 'free',  -- 'free' | 'paid' | 'enterprise' | 'custom'
  custom_budget_cents INTEGER,               -- For custom budgets

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

## Cost Calculation

```typescript
// lib/neon/consumption.ts
import { NEON_PRICING } from './pricing';

interface NeonConsumption {
  compute_time_seconds: number;
  synthetic_storage_size_bytes: number;
  data_transfer_bytes: number;
}

export function calculateDbCost(consumption: NeonConsumption): number {
  const computeCost = (consumption.compute_time_seconds / 3600) * NEON_PRICING.compute_per_cu_hour;
  const storageCost = (consumption.synthetic_storage_size_bytes / 1e9) * NEON_PRICING.storage_per_gb_month;
  const transferCost = (consumption.data_transfer_bytes / 1e9) * NEON_PRICING.data_transfer_per_gb;
  return computeCost + storageCost + transferCost;
}
```

---

## Consumption Sync Flow

### Cron Job

```typescript
// app/api/cron/sync-db-consumption/route.ts
export async function GET(req: Request) {
  // 1. Get all users with active databases
  const users = await getUsersWithDatabases();

  for (const user of users) {
    await syncUserConsumption(user.id);
  }

  return Response.json({ success: true });
}

async function syncUserConsumption(userId: string) {
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

  // 3. Update user budget
  const budgetConfig = await getUserDbBudget(userId);
  const budgetLimit = getBudgetLimitCents(budgetConfig.budgetTier);
  const totalCostCents = Math.round(totalCost * 100);

  await db.update(userDbBudget)
    .set({
      totalCostCents,
      budgetExceeded: totalCostCents >= budgetLimit,
      lastSync: new Date(),
    })
    .where(eq(userDbBudget.userId, userId));

  // 4. If budget exceeded, pause all projects
  if (totalCostCents >= budgetLimit) {
    await pauseUserProjects(userId);
  }
}
```

---

## Budget Enforcement

When budget is exceeded:

```typescript
async function pauseUserProjects(userId: string) {
  // Get all user's Neon projects
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

**User sees**: "You've reached your database usage limit. Upgrade your plan or wait for next billing period."

---

## Cost Breakdown API

```typescript
// GET /api/users/[userId]/database/usage
export async function GET(req: Request, { params }: { params: { userId: string } }) {
  const budgetConfig = await getUserDbBudget(params.userId);
  const globalDb = await getUserGlobalDatabase(params.userId);
  const agentDbs = await getUserWorkspaceDatabases(params.userId);

  const budgetLimitCents = getBudgetLimitCents(budgetConfig.budgetTier);

  const breakdown = [];

  // Global DB
  if (globalDb) {
    breakdown.push({
      type: 'global',
      name: 'Global DB',
      costCents: globalDb.currentPeriodCostCents,
    });
  }

  // Agent DBs
  for (const agentDb of agentDbs) {
    const workspace = await getWorkspace(agentDb.workspaceId);
    breakdown.push({
      type: 'agent',
      workspaceId: agentDb.workspaceId,
      name: workspace?.name ?? 'Unknown Agent',
      costCents: agentDb.currentPeriodCostCents,
    });
  }

  return Response.json({
    budget: {
      tier: budgetConfig.budgetTier,
      limitCents: budgetLimitCents,
      usedCents: budgetConfig.totalCostCents,
      exceeded: budgetConfig.budgetExceeded,
    },
    breakdown,
    periodStart: budgetConfig.currentPeriodStart,
    periodEnd: getNextPeriodStart(budgetConfig.currentPeriodStart),
  });
}
```

### Response Example

```json
{
  "budget": {
    "tier": "free",
    "limitCents": 200,
    "usedCents": 200,
    "exceeded": true
  },
  "breakdown": [
    { "type": "global", "name": "Global DB", "costCents": 45 },
    { "type": "agent", "workspaceId": "ws-123", "name": "Sales Bot", "costCents": 82 },
    { "type": "agent", "workspaceId": "ws-456", "name": "Support AI", "costCents": 23 },
    { "type": "agent", "workspaceId": "ws-789", "name": "Data Sync", "costCents": 50 }
  ],
  "periodStart": "2024-01-01T00:00:00Z",
  "periodEnd": "2024-02-01T00:00:00Z"
}
```

---

## UI Display

```
User Dashboard - Database Usage
──────────────────────────────────────────────────────
| Database           | This Month | % of Budget      |
|--------------------|------------|------------------|
| Global DB          | $0.45      | 22.5%            |
| Agent: Sales Bot   | $0.82      | 41.0%            |
| Agent: Support AI  | $0.23      | 11.5%            |
| Agent: Data Sync   | $0.50      | 25.0%            |
──────────────────────────────────────────────────────
| TOTAL              | $2.00      | 100% of $2 limit |
──────────────────────────────────────────────────────

[Upgrade Plan] to increase your database budget
```

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

Monthly billing period:

```typescript
// lib/neon/budgets.ts
export function getNextPeriodStart(currentStart: Date): Date {
  const next = new Date(currentStart);
  next.setMonth(next.getMonth() + 1);
  return next;
}

export async function resetBudgetPeriod(userId: string) {
  const now = new Date();

  // Reset user budget
  await db.update(userDbBudget)
    .set({
      currentPeriodStart: now,
      totalCostCents: 0,
      budgetExceeded: false,
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

  // Resume paused projects
  await resumeUserProjects(userId);
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
