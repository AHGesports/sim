import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import {
  createBrowserProfile,
  getBrowserProfiles,
  BrowserProfileProvider,
} from '@/lib/profiles'

const logger = createLogger('BrowserProfilesAPI')

const CreateBrowserProfileSchema = z.object({
  providerType: z.enum(['own_browser', 'more_login']),
  providerConfig: z.record(z.unknown()).optional(),
})

/**
 * GET /api/browser-profiles
 * List all browser profiles for the current user
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn('Unauthorized browser profile access attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const providerType = searchParams.get('providerType') as BrowserProfileProvider | null

    let profiles
    if (providerType) {
      const { getBrowserProfilesByProvider } = await import('@/lib/profiles')
      profiles = await getBrowserProfilesByProvider(session.user.id, providerType)
    } else {
      profiles = await getBrowserProfiles(session.user.id)
    }

    return NextResponse.json({
      success: true,
      data: profiles,
    })
  } catch (error) {
    logger.error('Error fetching browser profiles', error)
    return NextResponse.json({ error: 'Failed to fetch browser profiles' }, { status: 500 })
  }
}

/**
 * POST /api/browser-profiles
 * Create a new browser profile
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn('Unauthorized browser profile creation attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()

    try {
      const validatedData = CreateBrowserProfileSchema.parse(body)

      const browserProfile = await createBrowserProfile(session.user.id, {
        providerType: validatedData.providerType as BrowserProfileProvider,
        providerConfig: validatedData.providerConfig ?? {},
      })

      logger.info(`Browser profile created: ${browserProfile.id}`)

      return NextResponse.json({
        success: true,
        data: browserProfile,
      })
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        logger.warn('Invalid browser profile data', { errors: validationError.errors })
        return NextResponse.json(
          { error: 'Invalid request data', details: validationError.errors },
          { status: 400 }
        )
      }
      throw validationError
    }
  } catch (error) {
    logger.error('Error creating browser profile', error)
    return NextResponse.json({ error: 'Failed to create browser profile' }, { status: 500 })
  }
}
