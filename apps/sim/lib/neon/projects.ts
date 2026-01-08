/**
 * Low-level Neon project operations.
 * Shared by agent-database.ts and global-database.ts.
 */

import { createLogger } from '@sim/logger'

import { getApiClient } from './client'
import { NEON_PROJECT_DEFAULTS } from './config'
import type { NeonDatabaseResult } from './types'

const logger = createLogger('neon-projects')

/**
 * Create a new Neon project with the given name.
 * @param projectName - Name for the Neon project
 * @returns Database configuration including connection URI
 * @throws Error if project creation fails or no connection URI returned
 */
export async function createNeonProject(projectName: string): Promise<NeonDatabaseResult> {
  logger.info('Creating Neon project', { projectName })

  const client = getApiClient()

  const response = await client.createProject({
    project: {
      name: projectName,
      pg_version: NEON_PROJECT_DEFAULTS.pgVersion,
      region_id: NEON_PROJECT_DEFAULTS.regionId,
      default_endpoint_settings: {
        autoscaling_limit_min_cu: NEON_PROJECT_DEFAULTS.autoscalingMinCu,
        autoscaling_limit_max_cu: NEON_PROJECT_DEFAULTS.autoscalingMaxCu,
        suspend_timeout_seconds: NEON_PROJECT_DEFAULTS.suspendTimeoutSeconds,
      },
    },
  })

  const { project, branch, connection_uris } = response.data
  const connectionUri = connection_uris?.[0]?.connection_uri
  const connectionParams = connection_uris?.[0]?.connection_parameters

  if (!connectionUri) {
    throw new Error(`No connection URI returned from Neon for project: ${projectName}`)
  }

  logger.info('Created Neon project', { projectName, projectId: project.id })

  return {
    projectId: project.id,
    branchId: branch.id,
    connectionUri,
    databaseName: connectionParams?.database ?? NEON_PROJECT_DEFAULTS.databaseName,
    host: connectionParams?.host ?? '',
    user: connectionParams?.role ?? '',
  }
}

/**
 * Delete a Neon project.
 * @param projectId - The Neon project ID to delete
 * @throws Error if deletion fails
 */
export async function deleteNeonProject(projectId: string): Promise<void> {
  logger.info('Deleting Neon project', { projectId })

  const client = getApiClient()
  await client.deleteProject(projectId)

  logger.info('Deleted Neon project', { projectId })
}
