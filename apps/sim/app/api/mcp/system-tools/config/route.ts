/**
 * API endpoint for managing system MCP tool configurations.
 * Allows enabling/disabling individual tools per workspace.
 */

import { createLogger } from '@sim/logger'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/auth'
import { getWorkspaceToolConfig, bulkSetToolsEnabled } from '@/lib/db/queries'

const logger = createLogger('SystemMcpToolConfigAPI')

/**
 * GET /api/mcp/system-tools/config?workspaceId=X
 * Returns tool configuration for a workspace.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const workspaceId = request.nextUrl.searchParams.get('workspaceId')
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    const config = await getWorkspaceToolConfig(workspaceId)

    return NextResponse.json({
      success: true,
      data: { config },
    })
  } catch (error) {
    logger.error('Failed to get tool config:', error)
    return NextResponse.json({ error: 'Failed to get tool config' }, { status: 500 })
  }
}

/**
 * PUT /api/mcp/system-tools/config
 * Updates tool configuration for a workspace.
 *
 * Body: {
 *   workspaceId: string,
 *   serverId: string,
 *   tools: Array<{ toolName: string, enabled: boolean }>
 * }
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { workspaceId, serverId, tools } = body

    if (!workspaceId || !serverId || !Array.isArray(tools)) {
      return NextResponse.json(
        { error: 'workspaceId, serverId, and tools array required' },
        { status: 400 }
      )
    }

    // Validate serverId is a system server
    if (!serverId.startsWith('system:')) {
      return NextResponse.json(
        { error: 'Only system servers can be configured here' },
        { status: 400 }
      )
    }

    await bulkSetToolsEnabled(workspaceId, serverId, tools)

    logger.info(`Updated ${tools.length} tool configs for ${serverId} in workspace ${workspaceId}`)

    return NextResponse.json({
      success: true,
      data: { updated: tools.length },
    })
  } catch (error) {
    logger.error('Failed to update tool config:', error)
    return NextResponse.json({ error: 'Failed to update tool config' }, { status: 500 })
  }
}
