# Neon API Integration

## Design Principles

- **SOLID**: Single Responsibility for each file
- **DRY**: Shared logic extracted to common modules
- **KISS**: Simple, focused functions
- **Fail Hard**: Throw on missing config or API errors

---

## Required Packages

```bash
bun add @neondatabase/api-client  # Project management
bun add @neondatabase/serverless  # Query execution (Phase 5)
```

## Environment Variables

```env
# Single org (Scale Plan)
NEON_API_KEY=neon_api_key_here

# OR Agent Plan (two orgs)
NEON_FREE_ORG_API_KEY=free_org_api_key
NEON_PAID_ORG_API_KEY=paid_org_api_key

# Encryption key for connection URIs
NEON_CONNECTION_ENCRYPTION_KEY=your_encryption_key
```

---

## File Structure (SOLID)

```
lib/neon/
├── client.ts           # API client singleton (SRP: client management)
├── config.ts           # NEON_PROJECT_DEFAULTS (SRP: configuration)
├── projects.ts         # createNeonProject, deleteNeonProject (SRP: low-level ops)
├── agent-database.ts   # createAgentDatabase (SRP: workspace domain)
├── global-database.ts  # createUserGlobalDatabase (SRP: user domain)
├── types.ts            # NeonDatabaseResult (SRP: type definitions)
└── index.ts            # Barrel exports
```

### Why This Structure?

| File | Responsibility | Future Extensions |
|------|----------------|-------------------|
| `client.ts` | API client singleton | Multi-org support (Agent Plan) |
| `config.ts` | Project defaults | Add pricing constants (Phase 4) |
| `projects.ts` | Low-level Neon ops | Add pause/resume (Phase 4) |
| `agent-database.ts` | Workspace DB lifecycle | Add query helpers (Phase 5) |
| `global-database.ts` | User DB lifecycle | Add query helpers (Phase 5) |

---

## Implementation

### client.ts - API Client Singleton

```typescript
import { createApiClient, type Api } from '@neondatabase/api-client'

let apiClient: Api<unknown> | null = null

/**
 * Get the Neon API client instance.
 * @throws Error if NEON_API_KEY is not set
 */
export function getApiClient(): Api<unknown> {
  if (!apiClient) {
    const apiKey = process.env.NEON_API_KEY
    if (!apiKey) {
      throw new Error('NEON_API_KEY environment variable is not set')
    }
    apiClient = createApiClient({ apiKey })
  }
  return apiClient
}
```

### config.ts - Project Defaults

```typescript
export const NEON_PROJECT_DEFAULTS = {
  pgVersion: 17,
  regionId: 'aws-us-east-1',
  databaseName: 'neondb',
  autoscalingMinCu: 0.25,
  autoscalingMaxCu: 2,
  suspendTimeoutSeconds: 60,
} as const
```

### projects.ts - Low-Level Operations (DRY)

```typescript
import { createLogger } from '@sim/logger'
import { getApiClient } from './client'
import { NEON_PROJECT_DEFAULTS } from './config'
import type { NeonDatabaseResult } from './types'

const logger = createLogger('neon-projects')

/**
 * Create a new Neon project with the given name.
 * @throws Error if project creation fails or no connection URI returned
 */
export async function createNeonProject(projectName: string): Promise<NeonDatabaseResult> {
  logger.info('Creating Neon project', { projectName })

  const client = getApiClient()

  const response = await client.createProject({
    project: {
      name: projectName,
      pg_version: NEON_PROJECT_DEFAULTS.pgVersion,
      region_id: NEON_PROJECT_DEFAULTS.regionId,
      default_endpoint_settings: {
        autoscaling_limit_min_cu: NEON_PROJECT_DEFAULTS.autoscalingMinCu,
        autoscaling_limit_max_cu: NEON_PROJECT_DEFAULTS.autoscalingMaxCu,
        suspend_timeout_seconds: NEON_PROJECT_DEFAULTS.suspendTimeoutSeconds,
      },
    },
  })

  const { project, branch, connection_uris } = response.data
  const connectionUri = connection_uris?.[0]?.connection_uri
  const connectionParams = connection_uris?.[0]?.connection_parameters

  if (!connectionUri) {
    throw new Error(`No connection URI returned from Neon for project: ${projectName}`)
  }

  logger.info('Created Neon project', { projectName, projectId: project.id })

  return {
    projectId: project.id,
    branchId: branch.id,
    connectionUri,
    databaseName: connectionParams?.database ?? NEON_PROJECT_DEFAULTS.databaseName,
    host: connectionParams?.host ?? '',
    user: connectionParams?.role ?? '',
  }
}

/**
 * Delete a Neon project.
 * @throws Error if deletion fails
 */
export async function deleteNeonProject(projectId: string): Promise<void> {
  logger.info('Deleting Neon project', { projectId })

  const client = getApiClient()
  await client.deleteProject(projectId)

  logger.info('Deleted Neon project', { projectId })
}
```

### agent-database.ts - Workspace Domain

```typescript
import { createLogger } from '@sim/logger'
import { createNeonProject } from './projects'
import type { NeonDatabaseResult } from './types'

const logger = createLogger('neon-agent-database')

/**
 * Create a database for an agent (workspace).
 * Uses full workspaceId for unique project naming.
 */
export async function createAgentDatabase(workspaceId: string): Promise<NeonDatabaseResult> {
  logger.info('Creating agent database', { workspaceId })

  const projectName = `agent-${workspaceId}`
  const result = await createNeonProject(projectName)

  logger.info('Created agent database', { workspaceId, projectId: result.projectId })

  return result
}
```

### global-database.ts - User Domain

```typescript
import { createLogger } from '@sim/logger'
import { createNeonProject } from './projects'
import type { NeonDatabaseResult } from './types'

const logger = createLogger('neon-global-database')

/**
 * Create a global database for a user.
 * Uses full userId for unique project naming.
 */
export async function createUserGlobalDatabase(userId: string): Promise<NeonDatabaseResult> {
  logger.info('Creating user global database', { userId })

  const projectName = `global-${userId}`
  const result = await createNeonProject(projectName)

  logger.info('Created user global database', { userId, projectId: result.projectId })

  return result
}
```

### types.ts

```typescript
/**
 * Result from creating a Neon database project.
 */
export interface NeonDatabaseResult {
  projectId: string
  branchId: string
  connectionUri: string
  databaseName: string
  host: string
  user: string
}
```

---

## Data Flow: How Agents Find Their Database

```
Phase 1: Neon Service (creates Neon projects)
    │
    ▼
Phase 2: Sim Integration (saves reference to local DB)
    │
    ├── On workspace creation:
    │   1. createAgentDatabase(workspaceId) → returns { projectId, connectionUri, ... }
    │   2. INSERT into workspace_database table (workspaceId → projectId mapping)
    │   3. Store encrypted connectionUri in workspace env vars
    │
    ▼
Phase 3: MCP Integration (agent uses database)
    │
    ├── Agent wants to use database:
    │   1. Look up workspace_database by workspaceId
    │   2. Decrypt connectionUri from record
    │   3. Pass to postgres-mcp for SQL execution
    │
    ▼
Result: Agent can CRUD its own isolated database
```

**Key Point**: Phase 1 only creates the Neon project. Phase 2 saves the mapping so agents can find their database later.

---

## MCP Integration: postgres-mcp

**Why postgres-mcp** (not neon-mcp):

| Factor | postgres-mcp |
|--------|-------------|
| Setup | Just connection string |
| Cost | Free (open source) |
| Compatibility | Any Postgres (Neon, Supabase, RDS, etc.) |
| CRUD | Full SQL support |
| Schema changes | CREATE, ALTER, DROP TABLE |
| Future-proof | Works if users bring own DB |

### Configuration

Agent MCP config to use postgres-mcp:

```json
{
  "postgres": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres", "<CONNECTION_STRING>"]
  }
}
```

### What Agents Can Do

With postgres-mcp, agents can:
- `SELECT` - Query data
- `INSERT` - Add records
- `UPDATE` - Modify records
- `DELETE` - Remove records
- `CREATE TABLE` - Create new tables
- `ALTER TABLE` - Modify schema
- `DROP TABLE` - Remove tables
- Any valid SQL

### Getting Connection String for Agent (Phase 2+)

```typescript
// In workspace API or MCP execution
const dbRecord = await db.query.workspaceDatabase.findFirst({
  where: eq(workspaceDatabase.workspaceId, workspaceId)
})

if (!dbRecord?.neonConnectionUri) {
  throw new Error('No database configured for this workspace')
}

const connectionUri = decrypt(dbRecord.neonConnectionUri)
// Pass connectionUri to postgres-mcp
```

---

## Connection Pooling (Phase 5)

For serverless environments, use pooled connections:

```typescript
export async function getPooledConnectionUri(projectId: string, branchId: string) {
  const client = getApiClient()
  const response = await client.getConnectionUri({
    projectId,
    branch_id: branchId,
    database_name: 'neondb',
    role_name: 'neondb_owner',
    pooled: true,  // Important for serverless!
  })
  return response.data.uri
}
```

Pooled connections support up to 10,000 concurrent connections via PgBouncer.
