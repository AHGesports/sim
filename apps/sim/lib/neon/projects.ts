/**
 * Low-level Neon project operations.
 * Shared by agent-database.ts and global-database.ts.
 */

import { createLogger } from '@sim/logger'

import { getApiClient } from './client'
import { NEON_PROJECT_DEFAULTS } from './config'
import { handleNeonError } from './errors'
import { withRetry } from './retry'
import { sanitizeError, sanitizeObject } from './sanitize'
import type { NeonDatabaseResult } from './types'

const logger = createLogger('neon-projects')

/**
 * Create a new Neon project with the given name.
 * Includes retry logic for transient failures.
 * @param projectName - Name for the Neon project
 * @returns Database configuration including connection URI
 * @throws NeonError subclass if project creation fails
 */
export async function createNeonProject(projectName: string): Promise<NeonDatabaseResult> {
  logger.info('Creating Neon project', { projectName })

  try {
    const result = await withRetry(
      async () => {
        const client = getApiClient()

        // Build endpoint settings, conditionally including suspend_timeout_seconds
        const endpointSettings: {
          autoscaling_limit_min_cu: number
          autoscaling_limit_max_cu: number
          suspend_timeout_seconds?: number
        } = {
          autoscaling_limit_min_cu: NEON_PROJECT_DEFAULTS.autoscalingMinCu,
          autoscaling_limit_max_cu: NEON_PROJECT_DEFAULTS.autoscalingMaxCu,
        }

        // Only include suspend_timeout_seconds if configured (not supported on free tier)
        if (NEON_PROJECT_DEFAULTS.suspendTimeoutSeconds !== null) {
          endpointSettings.suspend_timeout_seconds = NEON_PROJECT_DEFAULTS.suspendTimeoutSeconds
        }

        const response = await client.createProject({
          project: {
            name: projectName,
            pg_version: NEON_PROJECT_DEFAULTS.pgVersion,
            region_id: NEON_PROJECT_DEFAULTS.regionId,
            default_endpoint_settings: endpointSettings,
          },
        })

        const { project, branch, connection_uris } = response.data
        const connectionUri = connection_uris?.[0]?.connection_uri
        const connectionParams = connection_uris?.[0]?.connection_parameters

        if (!connectionUri) {
          throw new Error(`No connection URI returned from Neon for project: ${projectName}`)
        }

        logger.info('Created Neon project', {
          projectName,
          projectId: project.id,
          region: NEON_PROJECT_DEFAULTS.regionId,
        })

        return {
          projectId: project.id,
          branchId: branch.id,
          connectionUri,
          databaseName: connectionParams?.database ?? NEON_PROJECT_DEFAULTS.databaseName,
          host: connectionParams?.host ?? '',
          user: connectionParams?.role ?? '',
        }
      },
      {
        maxAttempts: 3,
        shouldRetry: (error) => {
          // Don't retry on 4xx errors (client errors like 412, 401, etc.)
          if (error && typeof error === 'object' && 'status' in error) {
            const status = (error as { status: number }).status
            return status >= 500 && status < 600
          }
          return false
        },
      }
    )

    return result
  } catch (error) {
    logger.error('Failed to create Neon project', {
      projectName,
      error: sanitizeError(error),
    })

    handleNeonError(error, 'Create Neon project')
  }
}

/**
 * Delete a Neon project.
 * Includes retry logic for transient failures.
 * @param projectId - The Neon project ID to delete
 * @throws NeonError subclass if deletion fails
 */
export async function deleteNeonProject(projectId: string): Promise<void> {
  logger.info('Deleting Neon project', { projectId })

  try {
    await withRetry(
      async () => {
        const client = getApiClient()
        await client.deleteProject(projectId)
      },
      { maxAttempts: 3 }
    )

    logger.info('Deleted Neon project', { projectId })
  } catch (error) {
    logger.error('Failed to delete Neon project', {
      projectId,
      error: sanitizeError(error),
    })

    handleNeonError(error, 'Delete Neon project')
  }
}
