import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import {
  createBrowserProfile,
  createProfile,
  deleteBrowserProfile,
  getProfiles,
  getProfilesByScope,
  BrowserProfileProvider,
  ProfileScope,
} from '@/lib/profiles'

const logger = createLogger('ProfilesAPI')

const CreateProfileSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    scope: z.enum(['global', 'workspace']),
    workspaceId: z.string().min(1).optional(),
    providerType: z.enum(['own_browser', 'more_login']).default('own_browser'),
    providerConfig: z.record(z.unknown()).optional(),
    profileData: z.record(z.unknown()).optional(),
  })
  .refine(
    (data) => {
      if (data.scope === 'global' && data.workspaceId) return false
      if (data.scope === 'workspace' && !data.workspaceId) return false
      return true
    },
    {
      message: 'Global profiles cannot have workspaceId, workspace profiles must have workspaceId',
      path: ['scope'],
    }
  )

/**
 * GET /api/profiles
 * List all profiles accessible by the current user
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn('Unauthorized profile access attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    const scope = searchParams.get('scope') as ProfileScope | null

    let profiles
    if (scope) {
      profiles = await getProfilesByScope(session.user.id, scope, workspaceId)
    } else {
      profiles = await getProfiles(session.user.id, workspaceId)
    }

    return NextResponse.json({
      success: true,
      data: profiles,
    })
  } catch (error) {
    logger.error('Error fetching profiles', error)
    return NextResponse.json({ error: 'Failed to fetch profiles' }, { status: 500 })
  }
}

/**
 * POST /api/profiles
 * Create a new agent profile with auto-created browser profile (defaults to own_browser)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn('Unauthorized profile creation attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const validatedData = CreateProfileSchema.parse(body)

    // Create browser profile first (required, defaults to own_browser)
    const browserProfile = await createBrowserProfile(session.user.id, {
      providerType: validatedData.providerType as BrowserProfileProvider,
      providerConfig: validatedData.providerConfig ?? {},
    })

    // Create agent profile linked to the browser profile
    let profile
    try {
      profile = await createProfile(session.user.id, {
        name: validatedData.name,
        scope: validatedData.scope as ProfileScope,
        workspaceId: validatedData.workspaceId,
        browserProfileId: browserProfile.id,
        profileData: validatedData.profileData ?? {},
      })
    } catch (profileError) {
      // Rollback: delete browser profile if agent profile creation fails
      await deleteBrowserProfile(browserProfile.id)
      throw profileError
    }

    logger.info(`Profile created: ${profile.id} with browser profile: ${browserProfile.id}`)

    return NextResponse.json({
      success: true,
      data: {
        ...profile,
        browserProfile,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Invalid profile data', { errors: error.errors })
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }
    logger.error('Error creating profile', error)
    return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 })
  }
}
