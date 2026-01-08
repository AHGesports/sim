# Database Explorer UI Strategy

## Design Principles

- **KISS**: Simple custom UI, minimal components
- **YAGNI**: Build only what's needed now
- **SRP**: Each component has one job

---

## Architecture (No OAuth Needed!)

Your backend is the only Neon API consumer:

```
User clicks "View Tables"
    → Your Frontend (React)
    → Your Backend API
    → Neon API (schema) / Serverless Driver (queries)
    → Return to Frontend
    → Display in UI
```

**No user-facing OAuth required** - backend handles all Neon communication.

---

## API Routes

### 1. List Tables

```typescript
// app/api/workspaces/[workspaceId]/database/tables/route.ts
import { getWorkspaceDatabase } from '@/lib/db/queries';
import { getAgentSchema } from '@/lib/neon/service';

export async function GET(
  req: Request,
  { params }: { params: { workspaceId: string } }
) {
  const dbConfig = await getWorkspaceDatabase(params.workspaceId);

  if (!dbConfig) {
    return Response.json({ error: 'No database configured' }, { status: 404 });
  }

  const schema = await getAgentSchema(
    dbConfig.neonProjectId,
    dbConfig.neonBranchId
  );

  return Response.json({ tables: schema.tables });
}
```

### 2. Get Table Data

```typescript
// app/api/workspaces/[workspaceId]/database/query/route.ts
import { getWorkspaceDatabase } from '@/lib/db/queries';
import { executeQuery } from '@/lib/neon/service';
import { decrypt } from '@/lib/encryption';

export async function POST(
  req: Request,
  { params }: { params: { workspaceId: string } }
) {
  const { table, limit = 100, offset = 0 } = await req.json();
  const dbConfig = await getWorkspaceDatabase(params.workspaceId);

  if (!dbConfig) {
    return Response.json({ error: 'No database configured' }, { status: 404 });
  }

  // Security: Sanitize table name
  const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '');
  const query = `SELECT * FROM "${safeTable}" LIMIT ${limit} OFFSET ${offset}`;

  const connectionUri = decrypt(dbConfig.neonConnectionUri);
  const result = await executeQuery(connectionUri, query);

  return Response.json({ rows: result, table: safeTable });
}
```

### 3. Execute SQL (Admin)

```typescript
// app/api/workspaces/[workspaceId]/database/execute/route.ts
import { getWorkspaceDatabase } from '@/lib/db/queries';
import { executeQuery } from '@/lib/neon/service';
import { decrypt } from '@/lib/encryption';

export async function POST(
  req: Request,
  { params }: { params: { workspaceId: string } }
) {
  const { sql } = await req.json();
  const dbConfig = await getWorkspaceDatabase(params.workspaceId);

  if (!dbConfig) {
    return Response.json({ error: 'No database configured' }, { status: 404 });
  }

  // TODO: Add permission check - user must own this workspace

  try {
    const connectionUri = decrypt(dbConfig.neonConnectionUri);
    const result = await executeQuery(connectionUri, sql);
    return Response.json({ success: true, result });
  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'Query failed'
    }, { status: 400 });
  }
}
```

### 4. Get Connection Info

```typescript
// app/api/workspaces/[workspaceId]/database/connection/route.ts
import { getWorkspaceDatabase } from '@/lib/db/queries';
import { decrypt } from '@/lib/encryption';

export async function GET(
  req: Request,
  { params }: { params: { workspaceId: string } }
) {
  const dbConfig = await getWorkspaceDatabase(params.workspaceId);

  if (!dbConfig) {
    return Response.json({ error: 'No database configured' }, { status: 404 });
  }

  const connectionUri = decrypt(dbConfig.neonConnectionUri);
  // Mask password for display
  const maskedUri = connectionUri.replace(/:[^@]+@/, ':****@');

  return Response.json({
    projectId: dbConfig.neonProjectId,
    databaseName: dbConfig.databaseName,
    maskedConnectionString: maskedUri,
    // Full string for copying (handle securely in frontend)
    connectionString: connectionUri,
  });
}
```

---

## Database Query Helper

```typescript
// lib/db/queries.ts
import { db } from '@/db';
import { workspaceDatabase } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function getWorkspaceDatabase(workspaceId: string) {
  const result = await db
    .select()
    .from(workspaceDatabase)
    .where(eq(workspaceDatabase.workspaceId, workspaceId))
    .limit(1);

  return result[0] ?? null;
}
```

---

## UI Components

### Recommended UI Structure

```
Workspace Settings Panel
├── General
├── Database  ← New section
│   ├── Connection Info
│   │   ├── Project ID: xxx
│   │   ├── Database: neondb
│   │   └── [Copy Connection String]
│   │
│   ├── Tables
│   │   ├── users (click to expand)
│   │   │   ├── Columns: id, name, email, created_at
│   │   │   └── [View Data] [Edit Schema]
│   │   ├── orders
│   │   └── [+ Create Table]
│   │
│   ├── SQL Editor
│   │   ├── [Textarea for SQL]
│   │   ├── [Run Query]
│   │   └── Results Table
│   │
│   └── Export
│       ├── [Export as JSON]
│       └── [Export as CSV]
```

### Component: TableList

```tsx
// components/database/table-list.tsx
'use client';

import { useState, useEffect } from 'react';

interface Table {
  name: string;
  columns: { name: string; type: string }[];
}

interface TableListProps {
  workspaceId: string;
}

export function TableList({ workspaceId }: TableListProps) {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/workspaces/${workspaceId}/database/tables`)
      .then(res => res.json())
      .then(data => {
        setTables(data.tables || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [workspaceId]);

  if (loading) return <div>Loading tables...</div>;

  return (
    <div className="space-y-2">
      {tables.length === 0 ? (
        <p className="text-muted-foreground">No tables yet</p>
      ) : (
        tables.map(table => (
          <TableItem key={table.name} table={table} workspaceId={workspaceId} />
        ))
      )}
    </div>
  );
}
```

### Component: SQLEditor

```tsx
// components/database/sql-editor.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface SQLEditorProps {
  workspaceId: string;
}

export function SQLEditor({ workspaceId }: SQLEditorProps) {
  const [sql, setSql] = useState('');
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runQuery = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/database/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql }),
      });

      const data = await res.json();

      if (data.success) {
        setResult(data.result);
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to execute query');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Textarea
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        placeholder="SELECT * FROM my_table;"
        className="font-mono"
        rows={5}
      />

      <Button onClick={runQuery} disabled={loading || !sql.trim()}>
        {loading ? 'Running...' : 'Run Query'}
      </Button>

      {error && (
        <div className="text-red-500 text-sm">{error}</div>
      )}

      {result && (
        <div className="overflow-x-auto">
          <pre className="text-sm">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
```

---

## Security Considerations

1. **Permission checks** - Verify user owns the workspace before any DB operation
2. **SQL injection** - Sanitize table names, use parameterized queries where possible
3. **Connection string exposure** - Only expose full string for copy action, mask in display
4. **Rate limiting** - Limit query frequency to prevent abuse
