/**
 * Query helpers for workspace system MCP tool configuration.
 * Manages enable/disable preferences for system MCP tools per workspace.
 */

import { createLogger } from '@sim/logger'
import { db, workspaceSystemMcpToolConfig } from '@sim/db'
import { and, eq } from 'drizzle-orm'

const logger = createLogger('WorkspaceMcpConfig')

export interface ToolConfigRecord {
  serverId: string
  toolName: string
  enabled: boolean
}

/**
 * Get all tool config for a workspace.
 * Returns only explicitly configured tools (not all available tools).
 */
export async function getWorkspaceToolConfig(workspaceId: string): Promise<ToolConfigRecord[]> {
  const records = await db
    .select({
      serverId: workspaceSystemMcpToolConfig.serverId,
      toolName: workspaceSystemMcpToolConfig.toolName,
      enabled: workspaceSystemMcpToolConfig.enabled,
    })
    .from(workspaceSystemMcpToolConfig)
    .where(eq(workspaceSystemMcpToolConfig.workspaceId, workspaceId))

  return records
}

/**
 * Get disabled tools for a specific server in a workspace.
 * Used to filter tools in getSystemMcpServers().
 */
export async function getDisabledTools(
  workspaceId: string,
  serverId: string
): Promise<Set<string>> {
  const records = await db
    .select({ toolName: workspaceSystemMcpToolConfig.toolName })
    .from(workspaceSystemMcpToolConfig)
    .where(
      and(
        eq(workspaceSystemMcpToolConfig.workspaceId, workspaceId),
        eq(workspaceSystemMcpToolConfig.serverId, serverId),
        eq(workspaceSystemMcpToolConfig.enabled, false)
      )
    )

  return new Set(records.map((r) => r.toolName))
}

/**
 * Update tool enabled/disabled status.
 * Uses upsert pattern - creates if not exists, updates if exists.
 */
export async function setToolEnabled(
  workspaceId: string,
  serverId: string,
  toolName: string,
  enabled: boolean
): Promise<void> {
  const id = `${workspaceId}-${serverId}-${toolName}`

  await db
    .insert(workspaceSystemMcpToolConfig)
    .values({
      id,
      workspaceId,
      serverId,
      toolName,
      enabled,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        workspaceSystemMcpToolConfig.workspaceId,
        workspaceSystemMcpToolConfig.serverId,
        workspaceSystemMcpToolConfig.toolName,
      ],
      set: {
        enabled,
        updatedAt: new Date(),
      },
    })

  logger.info(`Set tool ${toolName} on ${serverId} to ${enabled ? 'enabled' : 'disabled'}`)
}

/**
 * Bulk update tool configurations for a server.
 * More efficient than calling setToolEnabled multiple times.
 */
export async function bulkSetToolsEnabled(
  workspaceId: string,
  serverId: string,
  toolConfigs: Array<{ toolName: string; enabled: boolean }>
): Promise<void> {
  if (toolConfigs.length === 0) return

  const values = toolConfigs.map(({ toolName, enabled }) => ({
    id: `${workspaceId}-${serverId}-${toolName}`,
    workspaceId,
    serverId,
    toolName,
    enabled,
    updatedAt: new Date(),
  }))

  // Use transaction for atomicity
  await db.transaction(async (tx) => {
    for (const value of values) {
      await tx
        .insert(workspaceSystemMcpToolConfig)
        .values(value)
        .onConflictDoUpdate({
          target: [
            workspaceSystemMcpToolConfig.workspaceId,
            workspaceSystemMcpToolConfig.serverId,
            workspaceSystemMcpToolConfig.toolName,
          ],
          set: {
            enabled: value.enabled,
            updatedAt: value.updatedAt,
          },
        })
    }
  })

  logger.info(`Bulk updated ${toolConfigs.length} tool configs for ${serverId}`)
}
