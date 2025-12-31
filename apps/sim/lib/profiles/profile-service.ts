import { randomUUID } from 'crypto'
import { db } from '@sim/db'
import { agentProfile, browserProfile } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq, isNull, or } from 'drizzle-orm'
import {
  type AgentProfile,
  type BrowserProfile,
  type BrowserProfileProvider,
  type CreateProfileInput,
  ProfileScope,
  type UpdateProfileInput,
} from '@/lib/profiles/types'

const logger = createLogger('ProfileService')

// TODO: Implement permission system for profiles
// For now, all authenticated team members can do anything with profiles

/**
 * Get all profiles accessible by a user
 * Returns both global profiles and workspace-specific profiles for the given workspace
 */
export async function getProfiles(
  userId: string,
  workspaceId?: string | null
): Promise<AgentProfile[]> {
  const conditions = [eq(agentProfile.userId, userId)]

  if (workspaceId) {
    // Get global profiles (workspace_id is null) OR workspace-specific profiles
    conditions.push(
      or(isNull(agentProfile.workspaceId), eq(agentProfile.workspaceId, workspaceId))!
    )
  }

  const profiles = await db
    .select({
      id: agentProfile.id,
      userId: agentProfile.userId,
      workspaceId: agentProfile.workspaceId,
      scope: agentProfile.scope,
      browserProfileId: agentProfile.browserProfileId,
      name: agentProfile.name,
      profileData: agentProfile.profileData,
      createdAt: agentProfile.createdAt,
      updatedAt: agentProfile.updatedAt,
    })
    .from(agentProfile)
    .leftJoin(browserProfile, eq(agentProfile.browserProfileId, browserProfile.id))
    .where(and(...conditions))
    .orderBy(agentProfile.createdAt)

  return profiles.map((p) => ({
    ...p,
    scope: p.scope as ProfileScope,
    profileData: (p.profileData as Record<string, unknown>) ?? {},
  }))
}

/**
 * Get profiles by scope (global or workspace)
 */
export async function getProfilesByScope(
  userId: string,
  scope: ProfileScope,
  workspaceId?: string | null
): Promise<AgentProfile[]> {
  const conditions = [eq(agentProfile.userId, userId), eq(agentProfile.scope, scope)]

  if (scope === ProfileScope.Workspace && workspaceId) {
    conditions.push(eq(agentProfile.workspaceId, workspaceId))
  }

  const profiles = await db
    .select({
      id: agentProfile.id,
      userId: agentProfile.userId,
      workspaceId: agentProfile.workspaceId,
      scope: agentProfile.scope,
      browserProfileId: agentProfile.browserProfileId,
      name: agentProfile.name,
      profileData: agentProfile.profileData,
      createdAt: agentProfile.createdAt,
      updatedAt: agentProfile.updatedAt,
    })
    .from(agentProfile)
    .where(and(...conditions))
    .orderBy(agentProfile.createdAt)

  return profiles.map((p) => ({
    ...p,
    scope: p.scope as ProfileScope,
    profileData: (p.profileData as Record<string, unknown>) ?? {},
  }))
}

/**
 * Get a single profile by ID
 */
export async function getProfileById(profileId: string): Promise<AgentProfile | null> {
  const result = await db
    .select({
      id: agentProfile.id,
      userId: agentProfile.userId,
      workspaceId: agentProfile.workspaceId,
      scope: agentProfile.scope,
      browserProfileId: agentProfile.browserProfileId,
      name: agentProfile.name,
      profileData: agentProfile.profileData,
      createdAt: agentProfile.createdAt,
      updatedAt: agentProfile.updatedAt,
    })
    .from(agentProfile)
    .where(eq(agentProfile.id, profileId))
    .limit(1)

  if (result.length === 0) {
    return null
  }

  return {
    ...result[0],
    scope: result[0].scope as ProfileScope,
    profileData: (result[0].profileData as Record<string, unknown>) ?? {},
  }
}

/**
 * Get a profile with its browser profile included
 */
export async function getProfileWithBrowserProfile(
  profileId: string
): Promise<AgentProfile | null> {
  const result = await db
    .select({
      id: agentProfile.id,
      userId: agentProfile.userId,
      workspaceId: agentProfile.workspaceId,
      scope: agentProfile.scope,
      browserProfileId: agentProfile.browserProfileId,
      name: agentProfile.name,
      profileData: agentProfile.profileData,
      createdAt: agentProfile.createdAt,
      updatedAt: agentProfile.updatedAt,
      browserProfile: {
        id: browserProfile.id,
        userId: browserProfile.userId,
        providerType: browserProfile.providerType,
        providerConfig: browserProfile.providerConfig,
        createdAt: browserProfile.createdAt,
        updatedAt: browserProfile.updatedAt,
      },
    })
    .from(agentProfile)
    .leftJoin(browserProfile, eq(agentProfile.browserProfileId, browserProfile.id))
    .where(eq(agentProfile.id, profileId))
    .limit(1)

  if (result.length === 0) {
    return null
  }

  const profile = result[0]
  return {
    id: profile.id,
    userId: profile.userId,
    workspaceId: profile.workspaceId,
    scope: profile.scope as ProfileScope,
    browserProfileId: profile.browserProfileId,
    browserProfile: profile.browserProfile?.id
      ? ({
          id: profile.browserProfile.id,
          userId: profile.browserProfile.userId,
          providerType: profile.browserProfile.providerType as BrowserProfileProvider,
          providerConfig: (profile.browserProfile.providerConfig as Record<string, unknown>) ?? {},
          createdAt: profile.browserProfile.createdAt,
          updatedAt: profile.browserProfile.updatedAt,
        } satisfies BrowserProfile)
      : null,
    name: profile.name,
    profileData: (profile.profileData as Record<string, unknown>) ?? {},
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  }
}

/**
 * Create a new profile
 */
export async function createProfile(
  userId: string,
  data: CreateProfileInput
): Promise<AgentProfile> {
  const profileId = randomUUID()
  const now = new Date()

  // Validate scope and workspaceId consistency
  if (data.scope === ProfileScope.Global && data.workspaceId) {
    throw new Error('Global profiles cannot have a workspaceId')
  }
  if (data.scope === ProfileScope.Workspace && !data.workspaceId) {
    throw new Error('Workspace profiles must have a workspaceId')
  }

  const newProfile = {
    id: profileId,
    userId,
    workspaceId: data.scope === ProfileScope.Global ? null : data.workspaceId!,
    scope: data.scope,
    browserProfileId: data.browserProfileId ?? null,
    name: data.name,
    profileData: data.profileData ?? {},
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(agentProfile).values(newProfile)

  logger.info(`Created ${data.scope} profile: ${data.name} (${profileId})`)

  return {
    ...newProfile,
    scope: newProfile.scope as ProfileScope,
    profileData: newProfile.profileData as Record<string, unknown>,
  }
}

/**
 * Update an existing profile
 * Fails fast if profile doesn't exist
 */
export async function updateProfile(
  profileId: string,
  updates: UpdateProfileInput
): Promise<AgentProfile> {
  // Fail fast: check existence before updating
  const existingProfile = await getProfileById(profileId)
  if (!existingProfile) {
    throw new Error(`Profile ${profileId} not found`)
  }

  const now = new Date()
  const updateData: Record<string, unknown> = {
    updatedAt: now,
  }

  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.browserProfileId !== undefined) updateData.browserProfileId = updates.browserProfileId
  if (updates.profileData !== undefined) updateData.profileData = updates.profileData

  await db.update(agentProfile).set(updateData).where(eq(agentProfile.id, profileId))

  logger.info(`Updated profile: ${profileId}`)

  // Return updated profile
  const updatedProfile = await getProfileById(profileId)
  return updatedProfile!
}

/**
 * Delete a profile
 * Fails fast if profile doesn't exist
 */
export async function deleteProfile(profileId: string): Promise<void> {
  // Fail fast: check existence before deleting
  const existingProfile = await getProfileById(profileId)
  if (!existingProfile) {
    throw new Error(`Profile ${profileId} not found`)
  }

  await db.delete(agentProfile).where(eq(agentProfile.id, profileId))

  logger.info(`Deleted profile: ${profileId}`)
}
