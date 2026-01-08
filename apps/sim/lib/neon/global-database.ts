/**
 * Global database operations.
 * Handles user-scoped database lifecycle.
 */

import { createLogger } from '@sim/logger'

import { createNeonProject } from './projects'
import type { NeonDatabaseResult } from './types'

const logger = createLogger('neon-global-database')

/**
 * Create a global database for a user.
 * @param userId - The user ID to associate with this database
 * @returns Database configuration including connection URI
 * @throws Error if project creation fails
 */
export async function createUserGlobalDatabase(userId: string): Promise<NeonDatabaseResult> {
  logger.info('Creating user global database', { userId })

  const projectName = `global-${userId}`
  const result = await createNeonProject(projectName)

  logger.info('Created user global database', { userId, projectId: result.projectId })

  return result
}
