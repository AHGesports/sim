/**
 * TypeScript types for the Neon database service.
 * Phase 1: Only types needed for project creation/deletion.
 */

/**
 * Result from creating a new Neon database project.
 */
export interface NeonDatabaseResult {
  projectId: string
  branchId: string
  connectionUri: string
  databaseName: string
  host: string
  user: string
}
