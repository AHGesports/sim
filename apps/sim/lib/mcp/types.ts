/**
 * MCP Types - for connecting to external MCP servers
 */

export type McpTransport = 'streamable-http' | 'stdio'

export interface McpServerStatusConfig {
  consecutiveFailures: number
  lastSuccessfulDiscovery: string | null
}

export interface McpServerConfig {
  id: string
  name: string
  description?: string
  transport: McpTransport
  url?: string
  headers?: Record<string, string>
  timeout?: number
  retries?: number
  enabled?: boolean
  statusConfig?: McpServerStatusConfig
  createdAt?: string
  updatedAt?: string
}

export interface McpVersionInfo {
  supported: string[]
  preferred: string
}

export interface McpConsentRequest {
  type: 'tool_execution' | 'resource_access' | 'data_sharing'
  context: {
    serverId: string
    serverName: string
    action: string
    description?: string
    dataAccess?: string[]
    sideEffects?: string[]
  }
  expires?: number
}

export interface McpConsentResponse {
  granted: boolean
  expires?: number
  restrictions?: Record<string, unknown>
  auditId?: string
}

export interface McpSecurityPolicy {
  requireConsent: boolean
  allowedOrigins?: string[]
  blockedOrigins?: string[]
  maxToolExecutionsPerHour?: number
  auditLevel: 'none' | 'basic' | 'detailed'
}

/**
 * JSON Schema for tool input parameters.
 * Aligns with MCP SDK's Tool.inputSchema structure.
 */
export interface McpToolSchema {
  type: 'object'
  properties?: Record<string, unknown>
  required?: string[]
}

/**
 * MCP Tool with server context.
 * Extends the SDK's Tool type with app-specific server tracking.
 */
export interface McpTool {
  name: string
  description?: string
  inputSchema: McpToolSchema
  serverId: string
  serverName: string
}

export interface McpToolCall {
  name: string
  arguments: Record<string, unknown>
}

export interface McpToolResult {
  content?: Array<{
    type: 'text' | 'image' | 'resource'
    text?: string
    data?: string
    mimeType?: string
  }>
  isError?: boolean
  [key: string]: unknown
}

export interface McpConnectionStatus {
  connected: boolean
  lastConnected?: Date
  lastError?: string
}

export class McpError extends Error {
  constructor(
    message: string,
    public code?: number,
    public data?: unknown
  ) {
    super(message)
    this.name = 'McpError'
  }
}

export class McpConnectionError extends McpError {
  constructor(message: string, serverName: string) {
    super(`Failed to connect to "${serverName}": ${message}`)
    this.name = 'McpConnectionError'
  }
}

export interface McpServerSummary {
  id: string
  name: string
  url?: string
  transport?: McpTransport
  status: 'connected' | 'disconnected' | 'error'
  toolCount: number
  resourceCount?: number
  promptCount?: number
  lastSeen?: Date
  error?: string
}

export interface McpApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface McpToolDiscoveryResponse {
  tools: McpTool[]
  totalCount: number
  byServer: Record<string, number>
}

/**
 * MCP tool reference stored in workflow blocks (for validation).
 * Minimal version used for comparing against discovered tools.
 */
export interface StoredMcpToolReference {
  serverId: string
  serverUrl?: string
  toolName: string
  schema?: McpToolSchema
}

/**
 * Full stored MCP tool with workflow context (for API responses).
 * Extended version that includes which workflow the tool is used in.
 */
export interface StoredMcpTool extends StoredMcpToolReference {
  workflowId: string
  workflowName: string
}

/**
 * System MCP server types - virtual servers managed by the platform.
 * These are not stored in the mcpServers table.
 */
export type SystemMcpServerType = 'postgres-agent' | 'postgres-global'

/**
 * System MCP server IDs - prefixed with 'system:' to distinguish from user servers.
 */
export const SYSTEM_MCP_SERVER_IDS = {
  POSTGRES_AGENT: 'system:postgres-agent',
  POSTGRES_GLOBAL: 'system:postgres-global',
} as const

export type SystemMcpServerId = (typeof SYSTEM_MCP_SERVER_IDS)[keyof typeof SYSTEM_MCP_SERVER_IDS]

/**
 * System MCP server configuration.
 * Virtual server that connects to Neon MCP via HTTP.
 */
export interface SystemMcpServer {
  id: SystemMcpServerId
  name: string
  description: string
  connectionStatus: 'connected' | 'disconnected' | 'error'
  systemManaged: true
  tools: McpTool[]
  /** Neon project ID for this server - injected into tool calls automatically */
  neonProjectId?: string
}

/**
 * Neon MCP Server configuration.
 * Uses Neon's hosted MCP server for database operations.
 * @see https://neon.com/docs/ai/neon-mcp-server
 */
export const NEON_MCP_CONFIG = {
  /** Neon MCP Streamable HTTP endpoint (POST-based, recommended) */
  url: 'https://mcp.neon.tech/mcp',
  /** Default timeout for HTTP requests (ms) */
  timeout: 30000,
  /** Number of retries on failure */
  retries: 3,
} as const

/**
 * Allowed SQL tools from Neon MCP.
 * Only expose database query tools, not project management tools.
 */
export const NEON_MCP_ALLOWED_TOOLS = [
  'run_sql',
  'run_sql_transaction',
  'list_tables',
  'describe_table_schema',
] as const

export type NeonMcpAllowedTool = (typeof NEON_MCP_ALLOWED_TOOLS)[number]

/**
 * Check if a tool name is in the allowed list for system MCP servers.
 */
export function isAllowedNeonMcpTool(toolName: string): toolName is NeonMcpAllowedTool {
  return NEON_MCP_ALLOWED_TOOLS.includes(toolName as NeonMcpAllowedTool)
}

/**
 * Cached tool schema from one-time discovery.
 * Stored in mcp_tool_schema_cache table.
 */
export interface CachedToolSchema {
  name: string
  description?: string
  inputSchema: McpToolSchema
}

/**
 * Check if a server ID is a system MCP server.
 */
export function isSystemMcpServerId(serverId: string): serverId is SystemMcpServerId {
  return serverId.startsWith('system:')
}
