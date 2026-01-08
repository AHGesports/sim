/**
 * Neon database service exports.
 * Phase 1: Database provisioning and deletion.
 */

// Types
export type { NeonDatabaseResult } from './types'

// Configuration
export { NEON_PROJECT_DEFAULTS } from './config'

// Agent database operations (workspace-scoped)
export { createAgentDatabase } from './agent-database'

// Global database operations (user-scoped)
export { createUserGlobalDatabase } from './global-database'

// Low-level project operations (shared)
export { deleteNeonProject } from './projects'
