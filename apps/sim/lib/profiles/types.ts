/**
 * Profile System Types
 *
 * Type definitions for the agent profile system supporting both
 * global (user-level) and workspace-scoped profiles.
 */

/**
 * Browser profile provider types for anti-detection browser configurations
 */
export enum BrowserProfileProvider {
  OwnBrowser = 'own_browser',
  MoreLogin = 'more_login',
}

/**
 * Profile scope determines visibility and access
 * - global: Available across all user's workspaces
 * - workspace: Only available in the specific workspace
 */
export enum ProfileScope {
  Global = 'global',
  Workspace = 'workspace',
}

/**
 * Browser profile configuration for anti-detection browsers
 */
export interface BrowserProfile {
  id: string
  userId: string
  providerType: BrowserProfileProvider
  providerConfig: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

/**
 * Agent profile for workflow execution
 */
export interface AgentProfile {
  id: string
  userId: string
  workspaceId: string | null
  scope: ProfileScope
  browserProfileId: string | null
  browserProfile?: BrowserProfile | null
  name: string
  profileData: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

/**
 * Input for creating a new browser profile
 */
export interface CreateBrowserProfileInput {
  providerType: BrowserProfileProvider
  providerConfig?: Record<string, unknown>
}

/**
 * Input for updating an existing browser profile
 */
export interface UpdateBrowserProfileInput {
  providerType?: BrowserProfileProvider
  providerConfig?: Record<string, unknown>
}

/**
 * Input for creating a new agent profile
 */
export interface CreateProfileInput {
  name: string
  scope: ProfileScope
  workspaceId?: string
  browserProfileId?: string
  profileData?: Record<string, unknown>
}

/**
 * Input for updating an existing agent profile
 */
export interface UpdateProfileInput {
  name?: string
  browserProfileId?: string | null
  profileData?: Record<string, unknown>
}
