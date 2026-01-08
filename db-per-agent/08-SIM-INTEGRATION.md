# Sim Studio Integration

## Overview

Database provisioning is integrated into Sim Studio's lifecycle events:

| Event | Database Action |
|-------|-----------------|
| User Registration | Create global DB + budget record |
| Workspace Creation | Create agent DB |
| Workspace Deletion | Delete agent DB |
| User Deletion | Delete global DB |

---

## User Registration

**File**: `apps/sim/lib/auth/auth.ts`

**Hook**: `databaseHooks.user.create.after` (in `handleNewUser()`)

```typescript
import { createUserGlobalDatabase } from '@/lib/neon/service';
import { encrypt } from '@/lib/encryption';
import { db } from '@sim/db';
import { userGlobalDatabase, userDbBudget, environment } from '@sim/db/schema';

async function handleNewUser(userId: string) {
  // Existing: Create user stats
  await createUserStats(userId);

  // NEW: Create global database
  const globalDb = await createUserGlobalDatabase(userId, 'free');

  // NEW: Store database record
  await db.insert(userGlobalDatabase).values({
    userId,
    ownershipType: 'platform',
    neonProjectId: globalDb.projectId,
    neonBranchId: globalDb.branchId,
    neonConnectionUri: encrypt(globalDb.connectionUri),
    databaseName: globalDb.databaseName,
  });

  // NEW: Create budget record
  await db.insert(userDbBudget).values({
    userId,
    budgetTier: 'free',
  });

  // NEW: Store connection string as user env var
  const existingEnv = await db.select()
    .from(environment)
    .where(eq(environment.userId, userId))
    .limit(1);

  if (existingEnv.length > 0) {
    const variables = JSON.parse(decrypt(existingEnv[0].variables));
    variables.GLOBAL_DB_URL = globalDb.connectionUri;
    await db.update(environment)
      .set({ variables: encrypt(JSON.stringify(variables)) })
      .where(eq(environment.userId, userId));
  } else {
    await db.insert(environment).values({
      userId,
      variables: encrypt(JSON.stringify({ GLOBAL_DB_URL: globalDb.connectionUri })),
    });
  }
}
```

**Error Handling**: If global DB creation fails, the entire registration fails (transaction rollback).

---

## Workspace Creation

**File**: `apps/sim/app/api/workspaces/route.ts`

**Hook**: POST handler

```typescript
import { createAgentDatabase } from '@/lib/neon/service';
import { encrypt } from '@/lib/encryption';
import { db } from '@sim/db';
import { workspace, workspaceDatabase, workspaceEnvironment } from '@sim/db/schema';

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name } = await request.json();
  const workspaceId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    // Existing: Create workspace
    await tx.insert(workspace).values({
      id: workspaceId,
      name,
      userId: session.user.id,
    });

    // Existing: Create permissions, default workflow, etc.
    // ...

    // NEW: Create agent database
    const agentDb = await createAgentDatabase(workspaceId, 'free');

    // NEW: Store database record
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
      variables: encrypt(JSON.stringify({ AGENT_DB_URL: agentDb.connectionUri })),
    });
  });

  return Response.json({ id: workspaceId, name });
}
```

---

## Workspace Deletion

**File**: `apps/sim/app/api/workspaces/[id]/route.ts`

**Hook**: DELETE handler

```typescript
import { deleteAgentDatabase } from '@/lib/neon/service';
import { getWorkspaceDatabase } from '@/lib/db/queries';

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = params.id;

  // NEW: Delete Neon project before workspace
  const dbConfig = await getWorkspaceDatabase(workspaceId);
  if (dbConfig?.ownershipType === 'platform' && dbConfig.neonProjectId) {
    try {
      await deleteAgentDatabase(dbConfig.neonProjectId);
    } catch (error) {
      // Log but don't block deletion - Neon has 7-day recovery
      logger.error('Failed to delete Neon project', { projectId: dbConfig.neonProjectId, error });
    }
  }

  // Existing: Delete workspace (CASCADE handles workspace_database)
  await db.delete(workspace).where(eq(workspace.id, workspaceId));

  return Response.json({ success: true });
}
```

---

## User Deletion

**Hook**: Account deletion flow

```typescript
import { deleteAgentDatabase } from '@/lib/neon/service';
import { getUserGlobalDatabase } from '@/lib/db/queries';

async function handleUserDelete(userId: string) {
  // NEW: Delete global DB Neon project
  const globalDbConfig = await getUserGlobalDatabase(userId);
  if (globalDbConfig?.ownershipType === 'platform' && globalDbConfig.neonProjectId) {
    try {
      await deleteAgentDatabase(globalDbConfig.neonProjectId);
    } catch (error) {
      logger.error('Failed to delete global Neon project', { projectId: globalDbConfig.neonProjectId, error });
    }
  }

  // Workspaces will be deleted by CASCADE, which triggers their own
  // Neon project deletions via cascade hooks or background job

  // Existing: Delete user
  await db.delete(user).where(eq(user.id, userId));
}
```

---

## Tier Upgrade/Downgrade

**Hook**: Billing/subscription change

```typescript
import { db } from '@sim/db';
import { userDbBudget } from '@sim/db/schema';

async function handleTierChange(userId: string, newTier: 'free' | 'paid' | 'enterprise') {
  // Update user budget tier
  await db.update(userDbBudget)
    .set({
      budgetTier: newTier,
      updatedAt: new Date(),
    })
    .where(eq(userDbBudget.userId, userId));

  // If upgrading from exceeded state, resume projects
  const budget = await getUserDbBudget(userId);
  if (budget.budgetExceeded) {
    const newLimit = getBudgetLimitCents(newTier);
    if (budget.totalCostCents < newLimit) {
      await db.update(userDbBudget)
        .set({ budgetExceeded: false })
        .where(eq(userDbBudget.userId, userId));

      await resumeUserProjects(userId);
    }
  }
}
```

---

## Environment Variable Management

### User-Level Env Vars

```typescript
// lib/environment/utils.ts

export async function createUserEnvVar(userId: string, key: string, value: string) {
  const existingEnv = await db.select()
    .from(environment)
    .where(eq(environment.userId, userId))
    .limit(1);

  if (existingEnv.length > 0) {
    const variables = JSON.parse(decrypt(existingEnv[0].variables));
    variables[key] = value;
    await db.update(environment)
      .set({ variables: encrypt(JSON.stringify(variables)) })
      .where(eq(environment.userId, userId));
  } else {
    await db.insert(environment).values({
      userId,
      variables: encrypt(JSON.stringify({ [key]: value })),
    });
  }
}

export async function getUserEnvVar(userId: string, key: string): Promise<string | null> {
  const env = await db.select()
    .from(environment)
    .where(eq(environment.userId, userId))
    .limit(1);

  if (env.length === 0) return null;

  const variables = JSON.parse(decrypt(env[0].variables));
  return variables[key] ?? null;
}
```

### Workspace-Level Env Vars

```typescript
export async function createWorkspaceEnvVar(workspaceId: string, key: string, value: string) {
  const existingEnv = await db.select()
    .from(workspaceEnvironment)
    .where(eq(workspaceEnvironment.workspaceId, workspaceId))
    .limit(1);

  if (existingEnv.length > 0) {
    const variables = JSON.parse(decrypt(existingEnv[0].variables));
    variables[key] = value;
    await db.update(workspaceEnvironment)
      .set({ variables: encrypt(JSON.stringify(variables)) })
      .where(eq(workspaceEnvironment.workspaceId, workspaceId));
  } else {
    await db.insert(workspaceEnvironment).values({
      workspaceId,
      variables: encrypt(JSON.stringify({ [key]: value })),
    });
  }
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `packages/db/schema.ts` | Add `userGlobalDatabase`, `workspaceDatabase`, `userDbBudget` tables |
| `apps/sim/lib/auth/auth.ts` | Hook into `handleNewUser()` for global DB creation |
| `apps/sim/app/api/workspaces/route.ts` | Hook into POST for agent DB creation |
| `apps/sim/app/api/workspaces/[id]/route.ts` | Hook into DELETE for agent DB deletion |
| `apps/sim/lib/environment/utils.ts` | Add helpers for DB env vars |

## New Files to Create

| File | Purpose |
|------|---------|
| `packages/db/migrations/XXXX_add_database_tables.sql` | Migration for DB tables |
| `apps/sim/lib/neon/service.ts` | Neon API service |
| `apps/sim/lib/neon/types.ts` | TypeScript types |
| `apps/sim/lib/neon/pricing.ts` | Neon pricing constants |
| `apps/sim/lib/neon/budgets.ts` | User-level budget config |
| `apps/sim/lib/neon/consumption.ts` | Consumption tracking |
| `apps/sim/lib/db/queries.ts` | Database query helpers |
