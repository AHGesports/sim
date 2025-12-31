import { useEffect } from 'react'
import { createLogger } from '@sim/logger'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type AgentProfile,
  type BrowserProfile,
  BrowserProfileProvider,
  ProfileScope,
} from '@/lib/profiles/types'
import { useProfileStore } from '@/stores/profiles/store'

const logger = createLogger('ProfileQueries')

/**
 * API response types for type-safe mapping
 */
interface ApiProfileResponse {
  id: string
  userId: string
  workspaceId: string | null
  scope: string
  browserProfileId: string | null
  browserProfile?: ApiBrowserProfileResponse | null
  name: string
  profileData: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

interface ApiBrowserProfileResponse {
  id: string
  userId: string
  providerType: string
  providerConfig: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

/**
 * Query keys for profiles
 */
export const profileKeys = {
  all: ['profiles'] as const,
  lists: () => [...profileKeys.all, 'list'] as const,
  listByWorkspace: (workspaceId: string) =>
    [...profileKeys.lists(), 'workspace', workspaceId] as const,
  listGlobal: () => [...profileKeys.lists(), 'global'] as const,
  details: () => [...profileKeys.all, 'detail'] as const,
  detail: (id: string) => [...profileKeys.details(), id] as const,
}

/**
 * Query keys for browser profiles
 */
export const browserProfileKeys = {
  all: ['browserProfiles'] as const,
  lists: () => [...browserProfileKeys.all, 'list'] as const,
  list: () => [...browserProfileKeys.lists()] as const,
  details: () => [...browserProfileKeys.all, 'detail'] as const,
  detail: (id: string) => [...browserProfileKeys.details(), id] as const,
}

/**
 * Map API response to AgentProfile type
 */
function mapProfile(profile: ApiProfileResponse): AgentProfile {
  return {
    id: profile.id,
    userId: profile.userId,
    workspaceId: profile.workspaceId,
    scope: profile.scope as ProfileScope,
    browserProfileId: profile.browserProfileId,
    browserProfile: profile.browserProfile ? mapBrowserProfile(profile.browserProfile) : undefined,
    name: profile.name,
    profileData: profile.profileData || {},
    createdAt: new Date(profile.createdAt),
    updatedAt: new Date(profile.updatedAt),
  }
}

/**
 * Map API response to BrowserProfile type
 */
function mapBrowserProfile(profile: ApiBrowserProfileResponse): BrowserProfile {
  return {
    id: profile.id,
    userId: profile.userId,
    providerType: profile.providerType as BrowserProfileProvider,
    providerConfig: profile.providerConfig || {},
    createdAt: new Date(profile.createdAt),
    updatedAt: new Date(profile.updatedAt),
  }
}

/**
 * API response wrapper types
 */
interface ApiListResponse {
  success: boolean
  data: ApiProfileResponse[]
}

interface ApiDetailResponse {
  success: boolean
  data: ApiProfileResponse
}

/**
 * Fetch profiles for a workspace context (both global and workspace profiles)
 */
async function fetchProfilesForWorkspace(workspaceId: string): Promise<AgentProfile[]> {
  const response = await fetch(`/api/profiles?workspaceId=${workspaceId}`)

  if (!response.ok) {
    throw new Error('Failed to fetch profiles')
  }

  const json: ApiListResponse = await response.json()
  return json.data.map(mapProfile)
}

/**
 * Fetch only global profiles
 */
async function fetchGlobalProfiles(): Promise<AgentProfile[]> {
  const response = await fetch('/api/profiles?scope=global')

  if (!response.ok) {
    throw new Error('Failed to fetch global profiles')
  }

  const json: ApiListResponse = await response.json()
  return json.data.map(mapProfile)
}

/**
 * Fetch a single profile by ID
 */
async function fetchProfile(profileId: string): Promise<AgentProfile> {
  const response = await fetch(`/api/profiles/${profileId}`)

  if (!response.ok) {
    throw new Error('Failed to fetch profile')
  }

  const json: ApiDetailResponse = await response.json()
  return mapProfile(json.data)
}

/**
 * Hook to fetch profiles for a workspace context
 * Returns both global profiles and workspace-specific profiles
 */
export function useProfilesForWorkspace(workspaceId?: string) {
  const setProfiles = useProfileStore((state) => state.setProfiles)

  const query = useQuery({
    queryKey: profileKeys.listByWorkspace(workspaceId || ''),
    queryFn: () => fetchProfilesForWorkspace(workspaceId!),
    enabled: Boolean(workspaceId),
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  })

  useEffect(() => {
    if (query.data) {
      setProfiles(query.data)
    }
  }, [query.data, setProfiles])

  return query
}

/**
 * Hook to fetch only global profiles
 */
export function useGlobalProfiles() {
  return useQuery({
    queryKey: profileKeys.listGlobal(),
    queryFn: fetchGlobalProfiles,
    staleTime: 60 * 1000,
  })
}

/**
 * Hook to fetch a single profile
 */
export function useProfile(profileId?: string) {
  return useQuery({
    queryKey: profileKeys.detail(profileId || ''),
    queryFn: () => fetchProfile(profileId!),
    enabled: Boolean(profileId),
    staleTime: 60 * 1000,
  })
}

/**
 * Variables for creating a profile
 */
interface CreateProfileVariables {
  workspaceId: string
  name: string
  scope: ProfileScope
  providerType?: BrowserProfileProvider
  providerConfig?: Record<string, unknown>
  profileData?: Record<string, unknown>
}

/**
 * Hook to create a new profile
 */
export function useCreateProfile() {
  const queryClient = useQueryClient()
  const addProfile = useProfileStore((state) => state.addProfile)

  return useMutation({
    mutationFn: async (variables: CreateProfileVariables) => {
      const body: Record<string, unknown> = {
        name: variables.name,
        scope: variables.scope,
        providerType: variables.providerType || BrowserProfileProvider.OwnBrowser,
        providerConfig: variables.providerConfig,
        profileData: variables.profileData,
      }

      // Only include workspaceId for workspace-scoped profiles
      if (variables.scope === ProfileScope.Workspace) {
        body.workspaceId = variables.workspaceId
      }

      const response = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to create profile')
      }

      const { data } = await response.json()
      return mapProfile(data)
    },
    onSuccess: (data, variables) => {
      addProfile(data)
      queryClient.invalidateQueries({
        queryKey: profileKeys.listByWorkspace(variables.workspaceId),
      })
      if (variables.scope === ProfileScope.Global) {
        queryClient.invalidateQueries({ queryKey: profileKeys.listGlobal() })
      }
      logger.info(`Profile created: ${data.id}`)
    },
    onError: (error) => {
      logger.error('Failed to create profile', { error })
    },
  })
}

/**
 * Variables for updating a profile
 */
interface UpdateProfileVariables {
  workspaceId: string
  profileId: string
  updates: {
    name?: string
    browserProfileId?: string | null
    profileData?: Record<string, unknown>
  }
}

/**
 * Hook to update a profile
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient()
  const updateProfile = useProfileStore((state) => state.updateProfile)

  return useMutation({
    mutationFn: async ({ profileId, updates }: UpdateProfileVariables) => {
      const response = await fetch(`/api/profiles/${profileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to update profile')
      }

      const { data } = await response.json()
      return mapProfile(data)
    },
    onSuccess: (data, variables) => {
      updateProfile(data.id, data)
      queryClient.invalidateQueries({
        queryKey: profileKeys.listByWorkspace(variables.workspaceId),
      })
      queryClient.invalidateQueries({ queryKey: profileKeys.detail(variables.profileId) })
      logger.info(`Profile updated: ${data.id}`)
    },
    onError: (error) => {
      logger.error('Failed to update profile', { error })
    },
  })
}

/**
 * Variables for deleting a profile
 */
interface DeleteProfileVariables {
  workspaceId: string
  profileId: string
}

/**
 * Hook to delete a profile
 */
export function useDeleteProfile() {
  const queryClient = useQueryClient()
  const removeProfile = useProfileStore((state) => state.removeProfile)

  return useMutation({
    mutationFn: async ({ profileId }: DeleteProfileVariables) => {
      const response = await fetch(`/api/profiles/${profileId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to delete profile')
      }

      return response.json()
    },
    onSuccess: (_data, variables) => {
      removeProfile(variables.profileId)
      queryClient.invalidateQueries({
        queryKey: profileKeys.listByWorkspace(variables.workspaceId),
      })
      queryClient.invalidateQueries({ queryKey: profileKeys.listGlobal() })
      logger.info(`Profile deleted: ${variables.profileId}`)
    },
    onError: (error) => {
      logger.error('Failed to delete profile', { error })
    },
  })
}
