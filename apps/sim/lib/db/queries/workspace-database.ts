/**
 * Database query helpers for workspace-level Neon databases.
 * Handles workspace_database table.
 */

import { db } from '@sim/db'
import { workspaceDatabase } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { eq } from 'drizzle-orm'
import { encrypt } from '@/lib/encryption'
import type { NeonDatabaseResult } from '@/lib/neon'

const logger = createLogger('WorkspaceDatabaseQueries')

interface CreateWorkspaceDatabaseRecordParams {
  workspaceId: string
  neonResult: NeonDatabaseResult
}

/**
 * Creates a workspace_database record after Neon project creation.
 */
export async function createWorkspaceDatabaseRecord({
  workspaceId,
  neonResult,
}: CreateWorkspaceDatabaseRecordParams): Promise<void> {
  const encryptedUri = encrypt(neonResult.connectionUri)

  await db.insert(workspaceDatabase).values({
    id: crypto.randomUUID(),
    workspaceId,
    ownershipType: 'platform',
    neonProjectId: neonResult.projectId,
    neonBranchId: neonResult.branchId,
    neonConnectionUri: encryptedUri,
    databaseName: neonResult.databaseName,
  })

  logger.info('Created workspace_database record', { workspaceId })
}

/**
 * Gets the workspace_database record for a workspace.
 */
export async function getWorkspaceDatabase(workspaceId: string) {
  const records = await db
    .select()
    .from(workspaceDatabase)
    .where(eq(workspaceDatabase.workspaceId, workspaceId))
    .limit(1)

  return records[0] ?? null
}

/**
 * Gets all workspace_database records for a user (via workspace ownership).
 * Useful for cost aggregation.
 */
export async function getUserWorkspaceDatabases(userId: string) {
  const { workspace } = await import('@sim/db/schema')

  const records = await db
    .select({
      workspaceDatabase: workspaceDatabase,
      workspaceName: workspace.name,
    })
    .from(workspaceDatabase)
    .innerJoin(workspace, eq(workspaceDatabase.workspaceId, workspace.id))
    .where(eq(workspace.ownerId, userId))

  return records
}
