/**
 * System MCP Servers
 *
 * Manages virtual system MCP servers (postgres-agent, postgres-global).
 * Uses Neon's hosted MCP server for database operations.
 *
 * @see https://neon.com/docs/ai/neon-mcp-server
 */

import { createLogger } from '@sim/logger'
import { getUserGlobalDatabase, getWorkspaceDatabase, getDisabledTools } from '@/lib/db/queries'
import { McpClient } from '@/lib/mcp/client'
import {
  getCachedToolSchemas,
  cacheToolSchemas,
  hasCachedSchemas,
  clearCachedSchemas,
} from '@/lib/mcp/system-tool-cache'
import type {
  CachedToolSchema,
  McpServerConfig,
  McpTool,
  McpToolCall,
  McpToolResult,
  SystemMcpServer,
  SystemMcpServerId,
} from '@/lib/mcp/types'
import {
  SYSTEM_MCP_SERVER_IDS,
  NEON_MCP_CONFIG,
  NEON_MCP_ALLOWED_TOOLS,
  isSystemMcpServerId,
  isAllowedNeonMcpTool,
} from '@/lib/mcp/types'

const logger = createLogger('SystemMcp')

/**
 * Create Neon MCP client configuration.
 * Uses NEON_API_KEY from environment for authentication.
 */
function createNeonMcpConfig(serverId: string, serverName: string): McpServerConfig {
  const apiKey = process.env.NEON_API_KEY
  if (!apiKey) {
    throw new Error('NEON_API_KEY environment variable is required for system MCP servers')
  }

  return {
    id: serverId,
    name: serverName,
    transport: 'streamable-http',
    url: NEON_MCP_CONFIG.url,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    timeout: NEON_MCP_CONFIG.timeout,
    retries: NEON_MCP_CONFIG.retries,
    enabled: true,
  }
}

/**
 * Get system MCP servers available for a workspace.
 * Returns virtual server configs with tools from cached schemas.
 * If cache is empty and a database exists, triggers discovery automatically.
 */
export async function getSystemMcpServers(
  userId: string,
  workspaceId: string
): Promise<SystemMcpServer[]> {
  const servers: SystemMcpServer[] = []

  logger.info('getSystemMcpServers called', { userId, workspaceId })

  // Fetch database records once
  const workspaceDb = await getWorkspaceDatabase(workspaceId)
  const globalDb = await getUserGlobalDatabase(userId)

  logger.info('Database records fetched', {
    hasWorkspaceDb: !!workspaceDb,
    workspaceNeonProjectId: workspaceDb?.neonProjectId || null,
    hasGlobalDb: !!globalDb,
    globalNeonProjectId: globalDb?.neonProjectId || null,
  })

  // Get cached tool schemas (from one-time discovery)
  let cachedSchemas = await getCachedToolSchemas('postgres-agent')

  logger.info('Cached tool schemas', {
    hasCachedSchemas: !!cachedSchemas,
    cachedSchemaCount: cachedSchemas?.length || 0,
  })

  // If cache is empty, try to trigger discovery
  if (!cachedSchemas || cachedSchemas.length === 0) {
    logger.info('MCP tool schema cache is empty, attempting discovery')

    // We need at least one project to discover tools
    const projectId = workspaceDb?.neonProjectId || globalDb?.neonProjectId

    if (projectId) {
      try {
        await discoverAndCacheToolSchemas(projectId, true)
        // Re-fetch cached schemas after discovery
        cachedSchemas = await getCachedToolSchemas('postgres-agent')
      } catch (error) {
        logger.error('Failed to discover tool schemas:', error)
      }
    }

    if (!cachedSchemas || cachedSchemas.length === 0) {
      logger.warn('MCP tool schema cache is still empty after discovery attempt')
      return []
    }
  }

  // Build server list based on available databases
  // Note: Returns ALL tools for UI display. Disabled tool filtering happens at execution time.
  // Include neonProjectId so agent-handler can inject it into tool params at expansion time.
  if (workspaceDb?.neonProjectId) {
    servers.push({
      id: SYSTEM_MCP_SERVER_IDS.POSTGRES_AGENT,
      name: 'Agent Database MCP',
      description: 'Workspace-specific database for this agent',
      connectionStatus: 'connected',
      systemManaged: true,
      neonProjectId: workspaceDb.neonProjectId,
      tools: cachedSchemas.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        serverId: SYSTEM_MCP_SERVER_IDS.POSTGRES_AGENT,
        serverName: 'Agent Database MCP',
      })),
    })
  }
  if (globalDb?.neonProjectId) {
    servers.push({
      id: SYSTEM_MCP_SERVER_IDS.POSTGRES_GLOBAL,
      name: 'Globally Shared Database MCP',
      description: 'User global database shared across all workspaces',
      connectionStatus: 'connected',
      systemManaged: true,
      neonProjectId: globalDb.neonProjectId,
      tools: cachedSchemas.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        serverId: SYSTEM_MCP_SERVER_IDS.POSTGRES_GLOBAL,
        serverName: 'Globally Shared Database MCP',
      })),
    })
  }

  logger.info('getSystemMcpServers returning', {
    serverCount: servers.length,
    serverIds: servers.map((s) => s.id),
    totalTools: servers.reduce((acc, s) => acc + s.tools.length, 0),
  })

  return servers
}

/**
 * Get system MCP tools for a workspace (for UI population).
 * Uses cached schemas - NO database connection required.
 */
export async function getSystemMcpTools(
  userId: string,
  workspaceId: string
): Promise<McpTool[]> {
  const servers = await getSystemMcpServers(userId, workspaceId)
  return servers.flatMap((server) => server.tools)
}

/**
 * Execute a tool on a system MCP server.
 * Connects to Neon MCP via HTTP and injects project_id into tool arguments.
 * Checks if tool is disabled for the workspace before execution.
 */
export async function executeSystemMcpTool(
  userId: string,
  workspaceId: string,
  serverId: SystemMcpServerId,
  toolCall: McpToolCall
): Promise<McpToolResult> {
  logger.info(`Executing system MCP tool: ${toolCall.name} on ${serverId}`)

  // Check if tool is disabled for this workspace
  const disabledTools = await getDisabledTools(workspaceId, serverId)
  if (disabledTools.has(toolCall.name)) {
    logger.warn(`Tool ${toolCall.name} is disabled for workspace ${workspaceId}`)
    return {
      content: [
        {
          type: 'text',
          text: `Error: Tool "${toolCall.name}" is disabled for this workspace. Enable it in MCP settings to use.`,
        },
      ],
      isError: true,
    }
  }

  // Get project ID based on server type
  let projectId: string
  let serverName: string

  if (serverId === SYSTEM_MCP_SERVER_IDS.POSTGRES_AGENT) {
    const workspaceDb = await getWorkspaceDatabase(workspaceId)
    if (!workspaceDb?.neonProjectId) {
      throw new Error('Workspace database not found')
    }
    projectId = workspaceDb.neonProjectId
    serverName = 'Agent Database MCP'
  } else if (serverId === SYSTEM_MCP_SERVER_IDS.POSTGRES_GLOBAL) {
    const globalDb = await getUserGlobalDatabase(userId)
    if (!globalDb?.neonProjectId) {
      throw new Error('Global database not found')
    }
    projectId = globalDb.neonProjectId
    serverName = 'Globally Shared Database MCP'
  } else {
    throw new Error(`Unknown system server: ${serverId}`)
  }

  // Create Neon MCP client with HTTP transport
  const config = createNeonMcpConfig(serverId, serverName)
  const client = new McpClient(config, {
    requireConsent: false, // System servers don't require user consent
    auditLevel: 'basic',
  })

  try {
    await client.connect()

    // Inject projectId (camelCase to match Neon MCP schema) into tool arguments
    const toolCallWithProject: McpToolCall = {
      name: toolCall.name,
      arguments: {
        ...toolCall.arguments,
        projectId: projectId,
      },
    }

    // Log SQL queries for debugging (with truncation for very long queries)
    if (toolCallWithProject.arguments.sql) {
      const sql = String(toolCallWithProject.arguments.sql)
      const truncatedSql = sql.length > 500 ? sql.substring(0, 500) + '... [truncated]' : sql
      logger.info(`Executing SQL query on ${serverId}`, {
        toolName: toolCall.name,
        projectId,
        sqlPreview: truncatedSql,
        sqlLength: sql.length,
        databaseName: toolCallWithProject.arguments.databaseName,
        branchId: toolCallWithProject.arguments.branchId,
      })
    } else if (toolCallWithProject.arguments.sqlStatements) {
      const statements = toolCallWithProject.arguments.sqlStatements as string[]
      logger.info(`Executing SQL transaction on ${serverId}`, {
        toolName: toolCall.name,
        projectId,
        statementCount: Array.isArray(statements) ? statements.length : 'unknown',
        databaseName: toolCallWithProject.arguments.databaseName,
        branchId: toolCallWithProject.arguments.branchId,
      })
    }

    const result = await client.callTool(toolCallWithProject)

    // Log errors with full details
    if (result.isError) {
      const errorContent = result.content?.map((c) => c.text).filter(Boolean).join(' ') || 'Unknown error'
      logger.error(`Tool execution returned error from Neon MCP`, {
        toolName: toolCall.name,
        serverId,
        projectId,
        errorMessage: errorContent,
        arguments: toolCallWithProject.arguments,
        fullResult: result,
      })
    } else {
      logger.info(`Successfully executed tool ${toolCall.name} on ${serverId}`)
    }

    return result
  } catch (error) {
    logger.error(`Failed to execute system MCP tool ${toolCall.name} on ${serverId}`, {
      error,
      projectId,
      arguments: toolCall.arguments,
    })
    throw error
  } finally {
    await client.disconnect()
  }
}

/**
 * Discover and cache tool schemas from Neon MCP.
 * Should only be called once (triggered on first database creation).
 *
 * @param projectId - Any valid Neon project ID for discovery
 * @param force - If true, clears existing cache and re-discovers
 */
export async function discoverAndCacheToolSchemas(
  projectId: string,
  force = false
): Promise<void> {
  // Check if already cached (unless forcing re-discovery)
  if (!force && (await hasCachedSchemas())) {
    logger.info('Tool schemas already cached, skipping discovery')
    return
  }

  // Clear existing cache if forcing re-discovery
  if (force) {
    logger.info('Force re-discovery requested, clearing existing cache')
    await clearCachedSchemas()
  }

  logger.info('Starting MCP tool schema discovery using Neon MCP')

  const config = createNeonMcpConfig('discovery', 'Discovery Connection')
  const client = new McpClient(config, {
    requireConsent: false,
    auditLevel: 'none',
  })

  try {
    await client.connect()
    const allTools = await client.listTools()

    // Filter to only allowed SQL tools
    const allowedTools = allTools.filter((tool) => isAllowedNeonMcpTool(tool.name))

    logger.info(
      `Discovered ${allTools.length} tools from Neon MCP, filtering to ${allowedTools.length} allowed tools`
    )

    // Convert to cached schema format
    const schemas: CachedToolSchema[] = allowedTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }))

    // Cache for both server types (they use the same Neon MCP)
    await cacheToolSchemas('postgres-agent', schemas)
    await cacheToolSchemas('postgres-global', schemas)

    logger.info(`Cached ${schemas.length} tool schemas: ${schemas.map((s) => s.name).join(', ')}`)
  } finally {
    await client.disconnect()
  }
}

/**
 * Check if a server ID is a system MCP server.
 */
export { isSystemMcpServerId }
