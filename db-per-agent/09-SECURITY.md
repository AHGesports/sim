# Security Model

## Core Principle

**Connection strings NEVER leave the backend.**

Users and network traffic should never see raw database connection strings. All database access happens server-side.

---

## What Users Can See

| Item | Visible? |
|------|----------|
| Database exists | Yes - settings panel shows "Database: Connected" |
| Table names | Yes - via schema API |
| Query results | Yes - via query API |
| Connection strings | **Never** |
| MCP server in list | **No** - system-managed, hidden |

---

## Connection String Storage

### Encryption at Rest

All connection URIs are encrypted before storage:

```typescript
// lib/encryption.ts
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.NEON_CONNECTION_ENCRYPTION_KEY!, 'hex');

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

### Storage Locations

| Database | Table | Column |
|----------|-------|--------|
| Global DB | `user_global_database` | `neon_connection_uri` (encrypted) |
| Agent DB | `workspace_database` | `neon_connection_uri` (encrypted) |
| User Env | `environment` | `variables` (encrypted JSON) |
| Workspace Env | `workspace_environment` | `variables` (encrypted JSON) |

---

## MCP Integration Security

### Hidden MCP Servers

MCP servers for database access are system-managed and hidden from users:

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

**Why hidden**: The args contain `${GLOBAL_DB_URL}` which resolves to the connection string. If users could see the MCP server config, they'd see the connection string.

### Resolution Flow (Server-Side Only)

```
1. Agent executes MCP tool (e.g., postgres-global/query)
2. Backend loads MCP config (contains ${GLOBAL_DB_URL})
3. Backend calls getEffectiveDecryptedEnv(userId, workspaceId)
4. Backend decrypts connection string from env table
5. Backend resolves ${GLOBAL_DB_URL} → actual connection string
6. Backend spawns postgres-mcp with resolved connection string
7. postgres-mcp executes query against Neon
8. Backend returns only query results (no connection info)
```

---

## Environment Variable Resolution

```typescript
// lib/environment/utils.ts

export async function getEffectiveDecryptedEnv(
  userId: string,
  workspaceId?: string
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  // 1. Get user-level env vars (includes GLOBAL_DB_URL)
  const userEnv = await getUserEnvVars(userId);
  Object.assign(result, userEnv);

  // 2. Get workspace-level env vars (includes AGENT_DB_URL)
  if (workspaceId) {
    const workspaceEnv = await getWorkspaceEnvVars(workspaceId);
    Object.assign(result, workspaceEnv);  // Workspace vars override user vars
  }

  return result;
}

async function getUserEnvVars(userId: string): Promise<Record<string, string>> {
  const env = await db.select()
    .from(environment)
    .where(eq(environment.userId, userId))
    .limit(1);

  if (env.length === 0) return {};
  return JSON.parse(decrypt(env[0].variables));
}

async function getWorkspaceEnvVars(workspaceId: string): Promise<Record<string, string>> {
  const env = await db.select()
    .from(workspaceEnvironment)
    .where(eq(workspaceEnvironment.workspaceId, workspaceId))
    .limit(1);

  if (env.length === 0) return {};
  return JSON.parse(decrypt(env[0].variables));
}
```

---

## API Route Security

All database API routes enforce:

1. **Authentication** - User must be logged in
2. **Authorization** - User must own the workspace/resource
3. **No connection string exposure** - Only masked strings for display

### Example: Get Connection Info

```typescript
// GET /api/workspaces/[workspaceId]/database/connection
export async function GET(
  req: Request,
  { params }: { params: { workspaceId: string } }
) {
  // 1. Auth check
  const session = await getSession();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Authorization check
  const hasAccess = await userHasWorkspaceAccess(session.user.id, params.workspaceId);
  if (!hasAccess) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 3. Get database config
  const dbConfig = await getWorkspaceDatabase(params.workspaceId);
  if (!dbConfig) {
    return Response.json({ error: 'No database configured' }, { status: 404 });
  }

  // 4. Return MASKED connection string only
  const connectionUri = decrypt(dbConfig.neonConnectionUri);
  const maskedUri = connectionUri.replace(/:[^@]+@/, ':****@');

  return Response.json({
    projectId: dbConfig.neonProjectId,
    databaseName: dbConfig.databaseName,
    maskedConnectionString: maskedUri,
    // NOTE: Full connection string is NOT returned to frontend
  });
}
```

---

## SQL Injection Prevention

### Table Name Sanitization

```typescript
// Sanitize table name to prevent SQL injection
const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '');
const query = `SELECT * FROM "${safeTable}" LIMIT ${limit} OFFSET ${offset}`;
```

### Parameterized Queries

For user-provided values:

```typescript
import { neon } from '@neondatabase/serverless';

export async function executeParameterizedQuery(
  connectionUri: string,
  query: string,
  params: unknown[]
) {
  const sql = neon(connectionUri);
  return await sql(query, params);
}

// Usage
const result = await executeParameterizedQuery(
  connectionUri,
  'SELECT * FROM users WHERE id = $1',
  [userId]
);
```

---

## Rate Limiting

Database operations should be rate-limited:

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'),  // 10 requests per 10 seconds
});

export async function checkDatabaseRateLimit(userId: string): Promise<boolean> {
  const { success } = await ratelimit.limit(`db:${userId}`);
  return success;
}

// In API route
if (!await checkDatabaseRateLimit(session.user.id)) {
  return Response.json({ error: 'Rate limit exceeded' }, { status: 429 });
}
```

---

## Environment Variable Security

### Key Generation

Generate encryption key:

```bash
# Generate 32-byte (256-bit) key
openssl rand -hex 32
```

### .env Configuration

```env
# NEVER commit these to version control
NEON_API_KEY=neon_api_key_here
NEON_CONNECTION_ENCRYPTION_KEY=your_32_byte_hex_key_here
```

### .env.example

```env
# Neon API
NEON_API_KEY=

# Encryption key for connection URIs (generate with: openssl rand -hex 32)
NEON_CONNECTION_ENCRYPTION_KEY=
```

---

## Security Checklist

- [ ] Connection URIs encrypted at rest
- [ ] Encryption key stored securely (not in code)
- [ ] MCP servers hidden from user UI
- [ ] Connection strings never returned to frontend
- [ ] API routes check authentication
- [ ] API routes check authorization (workspace ownership)
- [ ] Table names sanitized before queries
- [ ] Parameterized queries for user-provided values
- [ ] Rate limiting on database operations
- [ ] Password masked in any displayed connection strings
