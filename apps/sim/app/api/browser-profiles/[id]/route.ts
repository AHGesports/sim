import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import {
  deleteBrowserProfile,
  getBrowserProfileById,
  updateBrowserProfile,
  BrowserProfileProvider,
} from '@/lib/profiles'

const logger = createLogger('BrowserProfileByIdAPI')

const UpdateBrowserProfileSchema = z.object({
  providerType: z.enum(['own_browser', 'more_login']).optional(),
  providerConfig: z.record(z.unknown()).optional(),
})

/**
 * GET /api/browser-profiles/[id]
 * Get a single browser profile by ID
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn('Unauthorized browser profile access attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const browserProfile = await getBrowserProfileById(id)

    if (!browserProfile) {
      return NextResponse.json({ error: 'Browser profile not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: browserProfile,
    })
  } catch (error) {
    logger.error('Error fetching browser profile', error)
    return NextResponse.json({ error: 'Failed to fetch browser profile' }, { status: 500 })
  }
}

/**
 * PATCH /api/browser-profiles/[id]
 * Update a browser profile
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn('Unauthorized browser profile update attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const existingProfile = await getBrowserProfileById(id)
    if (!existingProfile) {
      return NextResponse.json({ error: 'Browser profile not found' }, { status: 404 })
    }

    const body = await req.json()

    try {
      const validatedData = UpdateBrowserProfileSchema.parse(body)

      const updatedProfile = await updateBrowserProfile(id, {
        providerType: validatedData.providerType as BrowserProfileProvider | undefined,
        providerConfig: validatedData.providerConfig,
      })

      logger.info(`Browser profile updated: ${id}`)

      return NextResponse.json({
        success: true,
        data: updatedProfile,
      })
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        logger.warn('Invalid browser profile update data', { errors: validationError.errors })
        return NextResponse.json(
          { error: 'Invalid request data', details: validationError.errors },
          { status: 400 }
        )
      }
      throw validationError
    }
  } catch (error) {
    logger.error('Error updating browser profile', error)
    return NextResponse.json({ error: 'Failed to update browser profile' }, { status: 500 })
  }
}

/**
 * DELETE /api/browser-profiles/[id]
 * Delete a browser profile
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn('Unauthorized browser profile delete attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const existingProfile = await getBrowserProfileById(id)
    if (!existingProfile) {
      return NextResponse.json({ error: 'Browser profile not found' }, { status: 404 })
    }

    await deleteBrowserProfile(id)

    logger.info(`Browser profile deleted: ${id}`)

    return NextResponse.json({
      success: true,
      data: { message: 'Browser profile deleted successfully' },
    })
  } catch (error) {
    logger.error('Error deleting browser profile', error)
    return NextResponse.json({ error: 'Failed to delete browser profile' }, { status: 500 })
  }
}
