/**
 * System MCP Tools API
 *
 * Returns available system MCP tools (postgres-agent, postgres-global).
 * Uses cached schemas - NO database connection required.
 *
 * Supports two auth methods:
 * 1. Session-based auth (for Sim UI)
 * 2. Internal API key (for AutomationAgentApi)
 */

import { db } from '@sim/db'
import { workspace as workspaceTable } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { withMcpAuth } from '@/lib/mcp/middleware'
import { getSystemMcpServers } from '@/lib/mcp/system-servers'
import { createMcpErrorResponse, createMcpSuccessResponse } from '@/lib/mcp/utils'

const logger = createLogger('SystemMcpToolsAPI')

export const dynamic = 'force-dynamic'

/**
 * Validate internal API key for AutomationAgentApi access.
 */
function validateInternalApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-internal-api-key')
  const expectedKey = process.env.INTERNAL_API_SECRET

  if (!expectedKey) {
    return false
  }

  return apiKey === expectedKey
}

/**
 * Get workspace by ID to resolve userId.
 */
async function getWorkspaceOwnerId(workspaceId: string): Promise<string | null> {
  const rows = await db
    .select({ ownerId: workspaceTable.ownerId })
    .from(workspaceTable)
    .where(eq(workspaceTable.id, workspaceId))
    .limit(1)

  return rows[0]?.ownerId ?? null
}

/**
 * GET /api/mcp/system-tools
 *
 * Returns system MCP tools for a workspace.
 * Schemas come from DB cache (populated by one-time discovery).
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8)

  try {
    // Check for internal API key first (AutomationAgentApi)
    if (validateInternalApiKey(request)) {
      const workspaceId = request.nextUrl.searchParams.get('workspaceId')
      if (!workspaceId) {
        return createMcpErrorResponse(null, 'workspaceId required', 400)
      }

      // Get userId from workspace owner
      const userId = await getWorkspaceOwnerId(workspaceId)
      if (!userId) {
        return createMcpErrorResponse(null, 'Workspace not found', 404)
      }

      logger.info(`[${requestId}] Fetching system MCP tools via internal API`, { workspaceId })

      const servers = await getSystemMcpServers(userId, workspaceId)
      const tools = servers.flatMap((server) => server.tools)
      return createMcpSuccessResponse({ tools, servers })
    }

    // Fall back to session-based auth (Sim UI)
    return withMcpAuth('read')(async (req, { userId, workspaceId }) => {
      logger.info(`[${requestId}] Fetching system MCP tools`, { userId, workspaceId })

      const servers = await getSystemMcpServers(userId, workspaceId)
      const tools = servers.flatMap((server) => server.tools)
      return createMcpSuccessResponse({ tools, servers })
    })(request, { params: Promise.resolve({}) })
  } catch (error) {
    logger.error(`[${requestId}] Error fetching system MCP tools:`, error)
    return createMcpErrorResponse(error, 'Failed to fetch system tools', 500)
  }
}
