/**
 * Agent database operations.
 * Handles workspace-scoped database lifecycle.
 */

import { createLogger } from '@sim/logger'

import { createNeonProject } from './projects'
import type { NeonDatabaseResult } from './types'

const logger = createLogger('neon-agent-database')

/**
 * Create a database for an agent (workspace).
 * @param workspaceId - The workspace ID to associate with this database
 * @returns Database configuration including connection URI
 * @throws NeonError subclass if project creation fails
 */
export async function createAgentDatabase(workspaceId: string): Promise<NeonDatabaseResult> {
  logger.info('Creating agent database', { workspaceId })

  const projectName = `agent-${workspaceId}`
  const result = await createNeonProject(projectName)

  // Sanitize result before logging (removes connection URIs)
  logger.info('Created agent database', {
    workspaceId,
    projectId: result.projectId,
    databaseName: result.databaseName,
  })

  return result
}
