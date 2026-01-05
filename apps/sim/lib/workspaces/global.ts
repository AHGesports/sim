import { db } from '@sim/db'
import { workspace } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq } from 'drizzle-orm'

const logger = createLogger('GlobalWorkspace')

export interface GlobalWorkspace {
  id: string
  name: string
  ownerId: string
  billedAccountUserId: string
  allowPersonalApiKeys: boolean
  isGlobal: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * Get or create the Global workspace for a user.
 * Each user has exactly one Global workspace (enforced by unique constraint).
 *
 * @param userId - The user ID to get/create the Global workspace for
 * @returns The Global workspace
 */
export async function getOrCreateGlobalWorkspace(userId: string): Promise<GlobalWorkspace> {
  const existing = await db
    .select()
    .from(workspace)
    .where(and(eq(workspace.ownerId, userId), eq(workspace.isGlobal, true)))
    .limit(1)

  if (existing.length > 0) {
    return existing[0] as GlobalWorkspace
  }

  const globalWorkspaceId = crypto.randomUUID()
  const now = new Date()

  logger.info(`Creating Global workspace for user ${userId}`)

  await db.insert(workspace).values({
    id: globalWorkspaceId,
    name: 'Global',
    ownerId: userId,
    billedAccountUserId: userId,
    allowPersonalApiKeys: true,
    isGlobal: true,
    createdAt: now,
    updatedAt: now,
  })

  logger.info(`Created Global workspace ${globalWorkspaceId} for user ${userId}`)

  return {
    id: globalWorkspaceId,
    name: 'Global',
    ownerId: userId,
    billedAccountUserId: userId,
    allowPersonalApiKeys: true,
    isGlobal: true,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Get the Global workspace for a user if it exists.
 *
 * @param userId - The user ID to get the Global workspace for
 * @returns The Global workspace or null if it doesn't exist
 */
export async function getGlobalWorkspace(userId: string): Promise<GlobalWorkspace | null> {
  const existing = await db
    .select()
    .from(workspace)
    .where(and(eq(workspace.ownerId, userId), eq(workspace.isGlobal, true)))
    .limit(1)

  if (existing.length > 0) {
    return existing[0] as GlobalWorkspace
  }

  return null
}

/**
 * Check if a workspace is the Global workspace.
 *
 * @param workspaceId - The workspace ID to check
 * @returns True if the workspace is a Global workspace
 */
export async function isGlobalWorkspace(workspaceId: string): Promise<boolean> {
  const result = await db
    .select({ isGlobal: workspace.isGlobal })
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1)

  return result.length > 0 && result[0].isGlobal === true
}
