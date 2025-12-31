import { randomUUID } from 'crypto'
import { db } from '@sim/db'
import { browserProfile } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq } from 'drizzle-orm'
import type {
  BrowserProfile,
  BrowserProfileProvider,
  CreateBrowserProfileInput,
  UpdateBrowserProfileInput,
} from '@/lib/profiles/types'

const logger = createLogger('BrowserProfileService')

// TODO: Implement permission system for browser profiles
// For now, all authenticated team members can do anything with browser profiles

/**
 * Get all browser profiles for a user
 */
export async function getBrowserProfiles(userId: string): Promise<BrowserProfile[]> {
  const profiles = await db
    .select({
      id: browserProfile.id,
      userId: browserProfile.userId,
      providerType: browserProfile.providerType,
      providerConfig: browserProfile.providerConfig,
      createdAt: browserProfile.createdAt,
      updatedAt: browserProfile.updatedAt,
    })
    .from(browserProfile)
    .where(eq(browserProfile.userId, userId))
    .orderBy(browserProfile.createdAt)

  return profiles.map((p) => ({
    ...p,
    providerType: p.providerType as BrowserProfileProvider,
    providerConfig: (p.providerConfig as Record<string, unknown>) ?? {},
  }))
}

/**
 * Get a single browser profile by ID
 */
export async function getBrowserProfileById(profileId: string): Promise<BrowserProfile | null> {
  const result = await db
    .select({
      id: browserProfile.id,
      userId: browserProfile.userId,
      providerType: browserProfile.providerType,
      providerConfig: browserProfile.providerConfig,
      createdAt: browserProfile.createdAt,
      updatedAt: browserProfile.updatedAt,
    })
    .from(browserProfile)
    .where(eq(browserProfile.id, profileId))
    .limit(1)

  if (result.length === 0) {
    return null
  }

  return {
    ...result[0],
    providerType: result[0].providerType as BrowserProfileProvider,
    providerConfig: (result[0].providerConfig as Record<string, unknown>) ?? {},
  }
}

/**
 * Get browser profiles by provider type
 */
export async function getBrowserProfilesByProvider(
  userId: string,
  providerType: BrowserProfileProvider
): Promise<BrowserProfile[]> {
  const profiles = await db
    .select({
      id: browserProfile.id,
      userId: browserProfile.userId,
      providerType: browserProfile.providerType,
      providerConfig: browserProfile.providerConfig,
      createdAt: browserProfile.createdAt,
      updatedAt: browserProfile.updatedAt,
    })
    .from(browserProfile)
    .where(and(eq(browserProfile.userId, userId), eq(browserProfile.providerType, providerType)))
    .orderBy(browserProfile.createdAt)

  return profiles.map((p) => ({
    ...p,
    providerType: p.providerType as BrowserProfileProvider,
    providerConfig: (p.providerConfig as Record<string, unknown>) ?? {},
  }))
}

/**
 * Create a new browser profile
 */
export async function createBrowserProfile(
  userId: string,
  data: CreateBrowserProfileInput
): Promise<BrowserProfile> {
  const profileId = randomUUID()
  const now = new Date()

  const newProfile = {
    id: profileId,
    userId,
    providerType: data.providerType,
    providerConfig: data.providerConfig ?? {},
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(browserProfile).values(newProfile)

  logger.info(`Created browser profile with provider ${data.providerType} (${profileId})`)

  return {
    ...newProfile,
    providerType: newProfile.providerType as BrowserProfileProvider,
    providerConfig: newProfile.providerConfig as Record<string, unknown>,
  }
}

/**
 * Update an existing browser profile
 * Fails fast if profile doesn't exist
 */
export async function updateBrowserProfile(
  profileId: string,
  updates: UpdateBrowserProfileInput
): Promise<BrowserProfile> {
  // Fail fast: check existence before updating
  const existingProfile = await getBrowserProfileById(profileId)
  if (!existingProfile) {
    throw new Error(`Browser profile ${profileId} not found`)
  }

  const now = new Date()
  const updateData: Record<string, unknown> = {
    updatedAt: now,
  }

  if (updates.providerType !== undefined) updateData.providerType = updates.providerType
  if (updates.providerConfig !== undefined) updateData.providerConfig = updates.providerConfig

  await db.update(browserProfile).set(updateData).where(eq(browserProfile.id, profileId))

  logger.info(`Updated browser profile: ${profileId}`)

  // Return updated profile
  const updatedProfile = await getBrowserProfileById(profileId)
  return updatedProfile!
}

/**
 * Delete a browser profile
 * Fails fast if profile doesn't exist
 */
export async function deleteBrowserProfile(profileId: string): Promise<void> {
  // Fail fast: check existence before deleting
  const existingProfile = await getBrowserProfileById(profileId)
  if (!existingProfile) {
    throw new Error(`Browser profile ${profileId} not found`)
  }

  await db.delete(browserProfile).where(eq(browserProfile.id, profileId))

  logger.info(`Deleted browser profile: ${profileId}`)
}
