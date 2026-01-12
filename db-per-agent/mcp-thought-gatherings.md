# MCP Thought Gatherings

Investigation into MCP options for Neon Per-Agent Database System.

---

## Context

We need agents (AI) in the Agent block to connect to Neon databases via MCP. The goal is AI-driven database interactions, not direct queries.

**Requirements:**
- Works in serverless (Vercel/Railway)
- Supports multiple databases (per-workspace Agent DB + per-user Global DB)
- Integrates with existing Sim MCP infrastructure
- Minimal deployment/maintenance overhead

---

## Option 1: postgres-mcp-pro (CrystalDBA)

**Repository:** https://github.com/crystaldba/postgres-mcp

### Transports
- **stdio** (default) - Local process spawning
- **SSE** - Remote server mode via `--transport=sse`

### Deployment
```bash
docker run -p 8000:8000 \
  -e DATABASE_URI=postgresql://user:pass@host/db \
  crystaldba/postgres-mcp --transport=sse
```
Exposes endpoint at `http://localhost:8000/sse`

### Tools Provided
| Tool | Description |
|------|-------------|
| `list_schemas` | List all schemas in the database |
| `list_objects` | List tables, views, sequences, extensions |
| `get_object_details` | Get columns, constraints, indexes |
| `execute_sql` | Execute SQL statements |
| `explain_query` | Get execution plan with hypothetical indexes |
| `get_top_queries` | Report slowest queries (pg_stat_statements) |
| `analyze_workload_indexes` | Recommend indexes for workload |
| `analyze_query_indexes` | Recommend indexes for specific queries |
| `analyze_db_health` | Health checks (indexes, connections, vacuum, etc.) |

### Critical Limitation

**DATABASE_URI is set at startup and CANNOT be changed at runtime.**

This means:
- Each workspace/user database would need its OWN postgres-mcp container
- Cannot have one shared instance serving multiple databases
- Dynamic connection switching NOT supported

### Verdict: Not Ideal for Multi-Tenant

Would require one container per database, which is:
- Expensive (container per workspace)
- Complex orchestration
- Maintenance burden

---

## Option 2: Neon MCP Server (Official)

**Repository:** https://github.com/neondatabase/mcp-server-neon
**Docs:** https://neon.com/docs/ai/neon-mcp-server

### Transports
- **Streamable HTTP** (recommended) - `https://mcp.neon.tech/mcp`
- **SSE** (legacy) - `https://mcp.neon.tech/mcp`
- No stdio transport

### Deployment Options

**1. Remote/Managed (Recommended):**
```bash
# No local installation needed!
# Use Neon's hosted server at https://mcp.neon.tech/mcp
# Authenticate via OAuth or API key
```

**2. Local:**
```bash
npx @neondatabase/mcp-server-neon start <API_KEY>
```

### Tools Provided (~25 tools)

**Project Management:**
- `list_projects` - List your Neon projects
- `create_project` - Create new project
- `delete_project` - Delete project
- `describe_project` - Get project details
- `list_shared_projects` - List projects shared with you
- `list_organizations` - List organizations

**SQL & Schema:**
- `run_sql` - Execute SQL queries
- `run_sql_transaction` - Execute transactions
- `list_tables` - List tables in database
- `describe_table_schema` - Get table schema
- `get_connection_string` - Get connection string for project

**Branching:**
- `create_branch` - Create database branch
- `delete_branch` - Delete branch
- `compare_schemas` - Compare branch schemas
- `reset_branch` - Reset branch to parent

**Migrations (Two-Phase Safety):**
- `prepare_migration` - Prepare migration (creates branch)
- `complete_migration` - Apply migration to main

**Query Optimization:**
- `get_slow_queries` - Identify slow queries
- `explain_query` - Get execution plan
- `prepare_tuning` / `complete_tuning` - Index recommendations

**Auth:**
- `provision_neon_auth` - Set up Neon Auth

### Key Advantage: Project-Based, Not Connection-Based

Unlike postgres-mcp-pro, Neon MCP works with **project IDs**, not connection strings:

```
User: "List tables in project holy-lab-06003948"
→ Neon MCP uses project_id to route to correct database
```

**This means:**
- Single MCP endpoint can serve ALL our databases
- Pass `project_id` per request to specify which database
- No need to deploy multiple containers
- Works perfectly for multi-tenant!

### Authentication

**Option A: Platform API Key**
- Use our Neon API key in Authorization header
- Can access all projects created by our platform
- Best for system-managed databases

**Option B: OAuth**
- User authenticates with their Neon account
- For user-owned databases (future enhancement)

### Read-Only Mode
```
Header: x-read-only: true
```
Enforces read-only access for restricted agents.

### Verdict: Ideal for Multi-Tenant

- Hosted/managed (no deployment needed for us)
- Multi-project support via project_id
- HTTP-based (works in serverless)
- Neon maintains it (less work for us)
- Already integrates with Neon's infrastructure

---

## Existing Sim MCP Infrastructure

### Transports Supported
1. **Streamable HTTP** - Primary for deployed MCPs (`McpClient`)
2. **Stdio** - For system servers (`McpStdioClient`)

### How Deployed MCPs Work
1. User adds MCP server URL (e.g., `https://mcp.example.com/sse`)
2. Stored in `mcp_servers` table with headers, timeout, etc.
3. Supports env var substitution: `{{API_KEY}}`
4. McpClient connects via HTTP/SSE, discovers tools, executes

### Key Files
| File | Purpose |
|------|---------|
| `apps/sim/lib/mcp/client.ts` | HTTP/SSE MCP client |
| `apps/sim/lib/mcp/stdio-client.ts` | Stdio MCP client (spawns processes) |
| `apps/sim/lib/mcp/service.ts` | Stateless MCP service |
| `apps/sim/lib/mcp/system-servers.ts` | System server management |
| `apps/sim/app/api/mcp/servers/route.ts` | Server CRUD API |
| `apps/sim/app/api/mcp/tools/execute/route.ts` | Tool execution API |

### Database Schema (`mcp_servers` table)
- `transport`: 'streamable-http' or 'stdio'
- `url`: Server endpoint
- `headers`: JSON with env var support
- `connectionStatus`: tracking

---

## Comparison Matrix

| Feature | postgres-mcp-pro | Neon MCP Server |
|---------|------------------|-----------------|
| **Hosted Option** | No (self-deploy) | Yes (`mcp.neon.tech`) |
| **Multi-Database** | No (static URI) | Yes (project_id per request) |
| **Transport** | stdio, SSE | HTTP, SSE |
| **Serverless Compatible** | No (needs container) | Yes |
| **Tools Count** | ~9 | ~25 |
| **Query Optimization** | Yes (advanced) | Yes |
| **Index Recommendations** | Yes (workload-based) | Yes |
| **DB Health Checks** | Yes | No |
| **Branching Support** | No | Yes |
| **Migration Safety** | No | Yes (two-phase) |
| **Maintenance** | Us | Neon |

---

## Recommendation

### Use Neon MCP Server for System Databases

**Why:**
1. **Hosted** - No deployment/maintenance for us
2. **Multi-tenant** - Single endpoint, project_id routing
3. **Serverless** - Works on Vercel/Railway
4. **Native integration** - Built for Neon, always up-to-date
5. **Rich toolset** - 25 tools including branching, migrations

**How it would work:**
1. When workspace database is created, store `neon_project_id`
2. Auto-register Neon MCP as system server (like current approach)
3. Pass platform API key in Authorization header
4. Each tool call includes `project_id` to route to correct database
5. Use existing `McpClient` (HTTP transport) - no stdio needed!

**Trade-offs:**
- Lose some postgres-mcp-pro tools (analyze_db_health, analyze_workload_indexes)
- Gain branching, migrations, better Neon integration
- Dependency on Neon's hosted service (but we're already dependent on Neon for DBs)

### Keep postgres-mcp-pro as User Option

Users who want advanced DB analysis tools can still:
1. Deploy their own postgres-mcp-pro instance
2. Add it via "deployed MCPs" UI
3. Use it alongside Neon MCP

---

## Implementation Path (If Approved)

1. **Update system-servers.ts** - Use Neon MCP endpoint instead of stdio
2. **Update types** - Add project_id to tool calls
3. **Remove stdio-client.ts dependency** - No longer needed for system DBs
4. **Update tool-input.tsx** - Same UI, different backend
5. **Update execute route** - Pass project_id in tool arguments
6. **Test** - Verify multi-project access works

---

## Security Model: Isolation + Shared Access

### The Problem

- Agent 1 (Workspace 1) should NOT access Agent 2's database (Workspace 2)
- BUT all agents should be able to access a shared Global Database
- How do we enforce this with a single Neon MCP endpoint?

### The Solution: Server-Side Project ID Injection

**Key insight:** Agents never directly talk to Neon MCP. All requests route through our API.

```
Agent Block → /api/mcp/tools/execute → We inject project_id → Neon MCP
```

**Project ID mapping (controlled by us):**

| System Server | Project ID Source |
|---------------|-------------------|
| `system:postgres-agent` | `workspace_database.neon_project_id` |
| `system:postgres-global` | `user_global_database.neon_project_id` |

### What Agent 1 (Workspace 1) Sees

| Server | Tools | Routes To |
|--------|-------|-----------|
| "Agent Database" | run_sql, list_tables, etc. | Project 1 (isolated) |
| "Global Database" | run_sql, list_tables, etc. | Global Project (shared) |

### What Agent 2 (Workspace 2) Sees

| Server | Tools | Routes To |
|--------|-------|-----------|
| "Agent Database" | run_sql, list_tables, etc. | Project 2 (isolated) |
| "Global Database" | run_sql, list_tables, etc. | Global Project (same as Agent 1) |

### Security Guarantees

**Agent CANNOT:**
- Choose or override the project_id
- Access another workspace's project
- Even know other project_ids exist
- Bypass our API to talk directly to Neon MCP

**Agent CAN:**
- Use their own Agent DB (isolated per workspace)
- Use the shared Global DB (shared across all user's workspaces)
- Access BOTH databases in the same conversation

### Simultaneous Access to Both Projects

Yes! The agent can use both databases in one workflow:

```
User: "Copy all users from Global Database to Agent Database"

Agent:
1. Calls list_tables on "Global Database" → sees global tables
2. Calls run_sql on "Global Database" → SELECT * FROM users
3. Calls run_sql on "Agent Database" → INSERT INTO users...
```

Each tool call specifies which server (Agent DB vs Global DB), and we inject the correct project_id.

---

## Tool Discovery Flow

### How Agents Discover Available Tools

**Already implemented in current system!**

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Agent Block Loads                                        │
│    └── Calls GET /api/mcp/system-tools?workspaceId=X        │
├─────────────────────────────────────────────────────────────┤
│ 2. API Checks Availability                                  │
│    ├── Does workspace have neon_project_id? → Agent DB      │
│    └── Does user have global neon_project_id? → Global DB   │
├─────────────────────────────────────────────────────────────┤
│ 3. Returns Tools for Available Servers Only                 │
│    └── Tools include: server name, tool name, schema        │
├─────────────────────────────────────────────────────────────┤
│ 4. UI Auto-Populates Tools                                  │
│    ├── "Agent Database" section (if available)              │
│    │   └── run_sql, list_tables, describe_table_schema...   │
│    └── "Global Database" section (if available)             │
│        └── run_sql, list_tables, describe_table_schema...   │
├─────────────────────────────────────────────────────────────┤
│ 5. User Configures Tool Access                              │
│    ├── Auto - LLM decides when to use                       │
│    ├── Force - Always available to LLM                      │
│    └── Never - Hidden from LLM                              │
├─────────────────────────────────────────────────────────────┤
│ 6. At Execution Time                                        │
│    └── Only enabled tools passed to LLM context             │
└─────────────────────────────────────────────────────────────┘
```

### Tool Schema Caching

To avoid calling Neon MCP just to list tools (expensive), we cache tool schemas:

1. **One-time discovery** - On first database creation, call Neon MCP to get tool list
2. **Cache in DB** - Store in `mcp_tool_schema_cache` table
3. **Serve from cache** - All subsequent requests use cached schemas
4. **No connection needed** - Tool discovery doesn't hit Neon MCP

This is the same approach we had for postgres-mcp-pro, and it works even better with Neon MCP since the tools are stable.

---

## Open Questions

1. Does Neon MCP Server support batch operations efficiently?
2. Rate limits on `mcp.neon.tech`?
3. Can we pass custom headers for request tracing?
4. How does error handling differ from postgres-mcp-pro?

---

## Sources

- [Neon MCP Server GitHub](https://github.com/neondatabase/mcp-server-neon)
- [Neon MCP Server Docs](https://neon.com/docs/ai/neon-mcp-server)
- [postgres-mcp-pro GitHub](https://github.com/crystaldba/postgres-mcp)
- [Neon MCP Changelog Aug 2025](https://neon.com/docs/changelog/2025-08-29)

---

## Final Decision: Neon MCP Server ✅

**Date:** 2025-01-09

**Decision:** Replace postgres-mcp-pro (stdio) with Neon MCP Server (HTTP/SSE)

**Rationale:**
1. Serverless compatibility (Vercel/Railway)
2. Multi-tenant support via project_id routing
3. Zero deployment/maintenance overhead
4. Native Neon integration

**Implementation Complete:**
- [x] Added `NEON_MCP_CONFIG` constants to `types.ts`
- [x] Added `NEON_MCP_ALLOWED_TOOLS` filter (SQL tools only)
- [x] Updated `system-servers.ts` to use HTTP client
- [x] Implemented project_id injection in `executeSystemMcpTool()`
- [x] Updated `discoverAndCacheToolSchemas()` for HTTP transport
- [x] Deleted `stdio-client.ts`
- [x] Updated callers in `usage.ts` and `workspaces/route.ts`

**Allowed Tools (SQL only):**
- `run_sql` - Execute SQL queries
- `run_sql_transaction` - Execute transactions
- `list_tables` - List tables in database
- `describe_table_schema` - Get table schema

**Excluded Tools (for security/simplicity):**
- Project management tools (list_projects, create_project, etc.)
- Branching tools (create_branch, delete_branch, etc.)
- Migration tools
- Connection string retrieval
