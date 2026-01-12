/**
 * Global database operations.
 * Handles user-scoped database lifecycle.
 */

import { createLogger } from '@sim/logger'

import { createNeonProject } from './projects'
import { sanitizeObject } from './sanitize'
import type { NeonDatabaseResult } from './types'

const logger = createLogger('neon-global-database')

/**
 * Create a global database for a user.
 * @param userId - The user ID to associate with this database
 * @returns Database configuration including connection URI
 * @throws NeonError subclass if project creation fails
 */
export async function createUserGlobalDatabase(userId: string): Promise<NeonDatabaseResult> {
  logger.info('Creating user global database', { userId })

  const projectName = `global-${userId}`
  const result = await createNeonProject(projectName)

  // Sanitize result before logging (removes connection URIs)
  logger.info('Created user global database', {
    userId,
    projectId: result.projectId,
    databaseName: result.databaseName,
  })

  return result
}
