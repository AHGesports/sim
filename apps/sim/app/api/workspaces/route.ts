import { db } from '@sim/db'
import { permissions, workflow, workspace } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { createWorkspaceDatabaseRecord } from '@/lib/db/queries'
import { buildDefaultWorkflowArtifacts } from '@/lib/workflows/defaults'
import { saveWorkflowToNormalizedTables } from '@/lib/workflows/persistence/utils'
import { getOrCreateGlobalWorkspace } from '@/lib/workspaces/global'

const logger = createLogger('Workspaces')

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
})

// Get all workspaces for the current user
export async function GET() {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get or create the Global workspace for the user
  const globalWorkspace = await getOrCreateGlobalWorkspace(session.user.id)

  // Ensure the user has admin permissions on their Global workspace
  const globalPermission = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(
      and(
        eq(permissions.userId, session.user.id),
        eq(permissions.entityId, globalWorkspace.id),
        eq(permissions.entityType, 'workspace')
      )
    )
    .limit(1)

  if (globalPermission.length === 0) {
    await db.insert(permissions).values({
      id: crypto.randomUUID(),
      entityType: 'workspace' as const,
      entityId: globalWorkspace.id,
      userId: session.user.id,
      permissionType: 'admin' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }

  // Get all workspaces where the user has permissions (excluding global workspaces)
  const userWorkspaces = await db
    .select({
      workspace: workspace,
      permissionType: permissions.permissionType,
    })
    .from(permissions)
    .innerJoin(workspace, eq(permissions.entityId, workspace.id))
    .where(
      and(
        eq(permissions.userId, session.user.id),
        eq(permissions.entityType, 'workspace'),
        eq(workspace.isGlobal, false)
      )
    )
    .orderBy(desc(workspace.createdAt))

  if (userWorkspaces.length === 0) {
    // Create a default workspace for the user
    const defaultWorkspace = await createDefaultWorkspace(session.user.id, session.user.name)

    // Migrate existing workflows to the default workspace
    await migrateExistingWorkflows(session.user.id, defaultWorkspace.id)

    // Include the Global workspace in the response
    const globalWorkspaceWithMeta = {
      ...globalWorkspace,
      role: 'owner',
      permissions: 'admin',
    }

    return NextResponse.json({ workspaces: [defaultWorkspace], globalWorkspace: globalWorkspaceWithMeta })
  }

  // If user has workspaces but might have orphaned workflows, migrate them
  await ensureWorkflowsHaveWorkspace(session.user.id, userWorkspaces[0].workspace.id)

  // Format the response with permission information
  const workspacesWithPermissions = userWorkspaces.map(
    ({ workspace: workspaceDetails, permissionType }) => ({
      ...workspaceDetails,
      role: permissionType === 'admin' ? 'owner' : 'member', // Map admin to owner for compatibility
      permissions: permissionType,
    })
  )

  // Include the Global workspace in the response
  const globalWorkspaceWithMeta = {
    ...globalWorkspace,
    role: 'owner',
    permissions: 'admin',
  }

  return NextResponse.json({ workspaces: workspacesWithPermissions, globalWorkspace: globalWorkspaceWithMeta })
}

// POST /api/workspaces - Create a new workspace
export async function POST(req: Request) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { name } = createWorkspaceSchema.parse(await req.json())

    const newWorkspace = await createWorkspace(session.user.id, name)

    return NextResponse.json({ workspace: newWorkspace })
  } catch (error) {
    logger.error('Error creating workspace:', error)
    return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 })
  }
}

// Helper function to create a default workspace
async function createDefaultWorkspace(userId: string, userName?: string | null) {
  // Extract first name only by splitting on spaces and taking the first part
  const firstName = userName?.split(' ')[0] || null
  const workspaceName = firstName ? `${firstName}'s Workspace` : 'My Workspace'
  return createWorkspace(userId, workspaceName)
}

// Helper function to create a workspace
async function createWorkspace(userId: string, name: string) {
  const workspaceId = crypto.randomUUID()
  const workflowId = crypto.randomUUID()
  const now = new Date()

  // Create the workspace and initial workflow in a transaction
  try {
    await db.transaction(async (tx) => {
      // Create the workspace
      await tx.insert(workspace).values({
        id: workspaceId,
        name,
        ownerId: userId,
        billedAccountUserId: userId,
        allowPersonalApiKeys: true,
        createdAt: now,
        updatedAt: now,
      })

      // Create admin permissions for the workspace owner
      await tx.insert(permissions).values({
        id: crypto.randomUUID(),
        entityType: 'workspace' as const,
        entityId: workspaceId,
        userId: userId,
        permissionType: 'admin' as const,
        createdAt: now,
        updatedAt: now,
      })

      // Create initial workflow for the workspace (empty canvas)
      // Create the workflow
      await tx.insert(workflow).values({
        id: workflowId,
        userId,
        workspaceId,
        folderId: null,
        name: 'default-agent',
        description: 'Your first workflow - start building here!',
        color: '#3972F6',
        lastSynced: now,
        createdAt: now,
        updatedAt: now,
        isDeployed: false,
        runCount: 0,
        variables: {},
      })

      // No blocks are inserted - empty canvas

      logger.info(
        `Created workspace ${workspaceId} with initial workflow ${workflowId} for user ${userId}`
      )
    })

    const { workflowState } = buildDefaultWorkflowArtifacts()
    const seedResult = await saveWorkflowToNormalizedTables(workflowId, workflowState)

    if (!seedResult.success) {
      throw new Error(seedResult.error || 'Failed to seed default workflow state')
    }
  } catch (error) {
    logger.error(`Failed to create workspace ${workspaceId} with initial workflow:`, error)
    throw error
  }

  // Create Neon agent database for this workspace (async, non-blocking)
  initializeWorkspaceNeonDatabase(workspaceId).catch((error) => {
    logger.error(`Background Neon database creation failed for workspace ${workspaceId}:`, error)
  })

  // Return the workspace data directly instead of querying again
  return {
    id: workspaceId,
    name,
    ownerId: userId,
    billedAccountUserId: userId,
    allowPersonalApiKeys: true,
    createdAt: now,
    updatedAt: now,
    role: 'owner',
  }
}

/**
 * Initializes a Neon agent database for a workspace.
 * Fails silently if NEON_API_KEY is not configured.
 */
async function initializeWorkspaceNeonDatabase(workspaceId: string): Promise<void> {
  const neonApiKey = process.env.NEON_API_KEY

  if (!neonApiKey) {
    logger.info('Skipping Neon agent database creation: NEON_API_KEY not configured', {
      workspaceId,
    })
    return
  }

  try {
    const { createAgentDatabase } = await import('@/lib/neon')

    const neonResult = await createAgentDatabase(workspaceId)

    await createWorkspaceDatabaseRecord({ workspaceId, neonResult })

    logger.info('Neon agent database created for workspace', {
      workspaceId,
      projectId: neonResult.projectId,
    })
  } catch (error) {
    logger.error('Failed to create Neon agent database for workspace', {
      workspaceId,
      error,
    })
  }
}

// Helper function to migrate existing workflows to a workspace
async function migrateExistingWorkflows(userId: string, workspaceId: string) {
  // Find all workflows that have no workspace ID
  const orphanedWorkflows = await db
    .select({ id: workflow.id })
    .from(workflow)
    .where(and(eq(workflow.userId, userId), isNull(workflow.workspaceId)))

  if (orphanedWorkflows.length === 0) {
    return // No orphaned workflows to migrate
  }

  logger.info(
    `Migrating ${orphanedWorkflows.length} workflows to workspace ${workspaceId} for user ${userId}`
  )

  // Bulk update all orphaned workflows at once
  await db
    .update(workflow)
    .set({
      workspaceId: workspaceId,
      updatedAt: new Date(),
    })
    .where(and(eq(workflow.userId, userId), isNull(workflow.workspaceId)))
}

// Helper function to ensure all workflows have a workspace
async function ensureWorkflowsHaveWorkspace(userId: string, defaultWorkspaceId: string) {
  // First check if there are any orphaned workflows
  const orphanedWorkflows = await db
    .select()
    .from(workflow)
    .where(and(eq(workflow.userId, userId), isNull(workflow.workspaceId)))

  if (orphanedWorkflows.length > 0) {
    // Directly update any workflows that don't have a workspace ID in a single query
    await db
      .update(workflow)
      .set({
        workspaceId: defaultWorkspaceId,
        updatedAt: new Date(),
      })
      .where(and(eq(workflow.userId, userId), isNull(workflow.workspaceId)))

    logger.info(`Fixed ${orphanedWorkflows.length} orphaned workflows for user ${userId}`)
  }
}
