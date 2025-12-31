import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import {
  deleteProfile,
  getProfileWithBrowserProfile,
  updateProfile,
  updateBrowserProfile,
  BrowserProfileProvider,
} from '@/lib/profiles'

const logger = createLogger('ProfileByIdAPI')

const UpdateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  browserProfileId: z.string().nullable().optional(),
  profileData: z.record(z.unknown()).optional(),
  // Browser profile updates (when changing the provider config)
  providerType: z.enum(['own_browser', 'more_login']).optional(),
  providerConfig: z.record(z.unknown()).optional(),
})

/**
 * GET /api/profiles/[id]
 * Get a single profile by ID with its browser profile
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn('Unauthorized profile access attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profile = await getProfileWithBrowserProfile(id)

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: profile,
    })
  } catch (error) {
    logger.error('Error fetching profile', error)
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 })
  }
}

/**
 * PATCH /api/profiles/[id]
 * Update a profile and optionally its browser profile
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn('Unauthorized profile update attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const existingProfile = await getProfileWithBrowserProfile(id)
    if (!existingProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const body = await req.json()

    try {
      const validatedData = UpdateProfileSchema.parse(body)

      // Update browser profile if provider settings changed
      if (
        existingProfile.browserProfileId &&
        (validatedData.providerType || validatedData.providerConfig)
      ) {
        await updateBrowserProfile(existingProfile.browserProfileId, {
          providerType: validatedData.providerType as BrowserProfileProvider | undefined,
          providerConfig: validatedData.providerConfig,
        })
      }

      // Update the agent profile
      const updatedProfile = await updateProfile(id, {
        name: validatedData.name,
        browserProfileId: validatedData.browserProfileId,
        profileData: validatedData.profileData,
      })

      // Fetch the updated profile with browser profile
      const profileWithBrowser = await getProfileWithBrowserProfile(id)

      logger.info(`Profile updated: ${id}`)

      return NextResponse.json({
        success: true,
        data: profileWithBrowser,
      })
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        logger.warn('Invalid profile update data', { errors: validationError.errors })
        return NextResponse.json(
          { error: 'Invalid request data', details: validationError.errors },
          { status: 400 }
        )
      }
      throw validationError
    }
  } catch (error) {
    logger.error('Error updating profile', error)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}

/**
 * DELETE /api/profiles/[id]
 * Delete a profile (browser profile is kept for potential reuse)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn('Unauthorized profile delete attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const existingProfile = await getProfileWithBrowserProfile(id)
    if (!existingProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    await deleteProfile(id)

    logger.info(`Profile deleted: ${id}`)

    return NextResponse.json({
      success: true,
      data: { message: 'Profile deleted successfully' },
    })
  } catch (error) {
    logger.error('Error deleting profile', error)
    return NextResponse.json({ error: 'Failed to delete profile' }, { status: 500 })
  }
}
