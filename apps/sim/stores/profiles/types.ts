import type { AgentProfile } from '@/lib/profiles/types'

/**
 * Profile store state
 */
export interface ProfileState {
  /** Profiles indexed by ID */
  profiles: Record<string, AgentProfile>

  /** Activation state: workspaceId -> array of activated profileIds */
  activatedProfiles: Record<string, string[]>

  /** Loading state */
  isLoading: boolean

  /** Error message */
  error: string | null

  /** Whether the store has been hydrated from persistence */
  _hasHydrated: boolean
}

/**
 * Profile store actions
 */
export interface ProfileActions {
  /** Set all profiles (usually from API fetch) */
  setProfiles: (profiles: AgentProfile[]) => void

  /** Add a single profile */
  addProfile: (profile: AgentProfile) => void

  /** Update a profile by ID */
  updateProfile: (profileId: string, updates: Partial<AgentProfile>) => void

  /** Remove a profile by ID */
  removeProfile: (profileId: string) => void

  /** Get all global profiles */
  getGlobalProfiles: () => AgentProfile[]

  /** Get workspace profiles for a specific workspace */
  getWorkspaceProfiles: (workspaceId: string) => AgentProfile[]

  /** Toggle profile activation for a workspace */
  toggleProfile: (workspaceId: string, profileId: string) => void

  /** Get activated profile IDs for a workspace */
  getActivatedProfiles: (workspaceId: string) => string[]

  /** Check if a profile is activated in a workspace */
  isProfileActivated: (workspaceId: string, profileId: string) => boolean

  /** Get all workspaces where a profile is activated (for deletion warning) */
  getWorkspacesWithActivatedProfile: (profileId: string) => string[]

  /** Set loading state */
  setLoading: (isLoading: boolean) => void

  /** Set error state */
  setError: (error: string | null) => void

  /** Reset store to initial state */
  reset: () => void

  /** Mark store as hydrated */
  setHasHydrated: (hasHydrated: boolean) => void
}

/**
 * Initial state for the profile store
 */
export const initialState: ProfileState = {
  profiles: {},
  activatedProfiles: {},
  isLoading: false,
  error: null,
  _hasHydrated: false,
}
