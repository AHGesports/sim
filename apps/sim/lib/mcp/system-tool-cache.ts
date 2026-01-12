/**
 * System MCP Tool Schema Cache
 *
 * Handles permanent caching of postgres-mcp tool schemas.
 * One-time discovery populates the cache, subsequent requests use cached data.
 */

import { db } from '@sim/db'
import { mcpToolSchemaCache } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { eq } from 'drizzle-orm'
import type { CachedToolSchema, SystemMcpServerType } from '@/lib/mcp/types'

const logger = createLogger('SystemMcp')

/**
 * Get cached tool schemas for a server type.
 * Returns null if cache is empty (discovery hasn't run yet).
 */
export async function getCachedToolSchemas(
  serverType: SystemMcpServerType
): Promise<CachedToolSchema[] | null> {
  try {
    const cached = await db
      .select({
        toolSchema: mcpToolSchemaCache.toolSchema,
      })
      .from(mcpToolSchemaCache)
      .where(eq(mcpToolSchemaCache.serverType, serverType))

    if (cached.length === 0) {
      return null
    }

    return cached.map((row) => row.toolSchema as CachedToolSchema)
  } catch (error) {
    logger.error('Failed to get cached tool schemas:', error)
    return null
  }
}

/**
 * Check if tool schema cache exists for any server type.
 */
export async function hasCachedSchemas(): Promise<boolean> {
  try {
    const result = await db
      .select({ id: mcpToolSchemaCache.id })
      .from(mcpToolSchemaCache)
      .limit(1)

    return result.length > 0
  } catch (error) {
    logger.error('Failed to check cached schemas:', error)
    return false
  }
}

/**
 * Save discovered tool schemas to cache.
 * Called during one-time discovery.
 */
export async function cacheToolSchemas(
  serverType: SystemMcpServerType,
  tools: CachedToolSchema[]
): Promise<void> {
  try {
    const values = tools.map((tool) => ({
      id: crypto.randomUUID(),
      serverType,
      toolName: tool.name,
      toolSchema: {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
    }))

    // Use upsert to handle re-discovery
    for (const value of values) {
      await db
        .insert(mcpToolSchemaCache)
        .values(value)
        .onConflictDoUpdate({
          target: [mcpToolSchemaCache.serverType, mcpToolSchemaCache.toolName],
          set: {
            toolSchema: value.toolSchema,
            discoveredAt: new Date(),
          },
        })
    }

    logger.info(`Cached ${tools.length} tool schemas for ${serverType}`)
  } catch (error) {
    logger.error('Failed to cache tool schemas:', error)
    throw error
  }
}

/**
 * Clear cached schemas for a server type (useful for re-discovery).
 */
export async function clearCachedSchemas(serverType?: SystemMcpServerType): Promise<void> {
  try {
    if (serverType) {
      await db.delete(mcpToolSchemaCache).where(eq(mcpToolSchemaCache.serverType, serverType))
      logger.info(`Cleared cached schemas for ${serverType}`)
    } else {
      await db.delete(mcpToolSchemaCache)
      logger.info('Cleared all cached schemas')
    }
  } catch (error) {
    logger.error('Failed to clear cached schemas:', error)
    throw error
  }
}
