/**
 * TypeScript types for the Neon database service.
 * Phase 1: Only types needed for project creation/deletion.
 */

/**
 * Database ownership type - matches db_ownership_type enum in schema.
 * - 'platform': We manage the Neon project
 * - 'user': User connects their own database (future)
 */
export type DbOwnershipType = 'platform' | 'user'

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
