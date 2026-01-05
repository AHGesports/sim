'use client'

import { useCallback, useRef, useState } from 'react'
import { ArrowDown, ChevronRight, Globe, Plus, Workflow } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button, FolderPlus, Tooltip } from '@/components/emcn'
import { cn } from '@/lib/core/utils/cn'
import { useFolders, useCreateFolder } from '@/hooks/queries/folders'
import { useWorkflows, useCreateWorkflow } from '@/hooks/queries/workflows'
import { WorkflowList } from '@/app/workspace/[workspaceId]/w/components/sidebar/components/workflow-list/workflow-list'
import { useImportWorkflow } from '@/app/workspace/[workspaceId]/w/hooks/use-import-workflow'
import { SIDEBAR_SCROLL_EVENT } from '@/app/workspace/[workspaceId]/w/components/sidebar/sidebar'

interface GlobalWorkspace {
  id: string
  name: string
  ownerId: string
  role?: string
  permissions?: 'admin' | 'write' | 'read' | null
  isGlobal?: boolean
}

interface RegularWorkspace {
  id: string
  name: string
  ownerId: string
  role?: string
}

interface GlobalWorkflowsSectionProps {
  globalWorkspace: GlobalWorkspace
  regularWorkspaces: RegularWorkspace[]
  onShareClick?: () => void
}

/**
 * GlobalWorkflowsSection displays global workflows that are accessible across all workspaces.
 * Uses the same WorkflowList component but with the global workspace context.
 */
export function GlobalWorkflowsSection({
  globalWorkspace,
  regularWorkspaces,
}: GlobalWorkflowsSectionProps) {
  const router = useRouter()

  const [isWorkflowsExpanded, setIsWorkflowsExpanded] = useState(true)
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Fetch workflows for the global workspace
  const { data: globalWorkflows = [], isLoading: workflowsLoading } = useWorkflows(
    globalWorkspace.id
  )

  // Fetch folders for the global workspace
  const { isLoading: foldersLoading } = useFolders(globalWorkspace.id)

  // Create workflow mutation
  const createWorkflowMutation = useCreateWorkflow()

  // Create folder mutation
  const createFolderMutation = useCreateFolder()

  // Import workflow hook
  const { handleFileChange } = useImportWorkflow({ workspaceId: globalWorkspace.id })

  const isLoading = workflowsLoading || foldersLoading

  /**
   * Handle creating a new workflow in the global workspace
   */
  const handleCreateWorkflow = useCallback(async () => {
    const result = await createWorkflowMutation.mutateAsync({
      workspaceId: globalWorkspace.id,
    })

    if (result?.id) {
      // Navigate to the new workflow in the global workspace context
      router.push(`/workspace/${globalWorkspace.id}/w/${result.id}`)

      // Scroll to the new workflow
      window.dispatchEvent(
        new CustomEvent(SIDEBAR_SCROLL_EVENT, { detail: { itemId: result.id } })
      )
    }
  }, [createWorkflowMutation, globalWorkspace.id, router])

  /**
   * Handle creating a new folder in the global workspace
   */
  const handleCreateFolder = useCallback(async () => {
    const result = await createFolderMutation.mutateAsync({
      workspaceId: globalWorkspace.id,
      name: 'New Folder',
    })

    if (result?.id) {
      // Scroll to the new folder
      window.dispatchEvent(
        new CustomEvent(SIDEBAR_SCROLL_EVENT, { detail: { itemId: result.id } })
      )
    }
  }, [createFolderMutation, globalWorkspace.id])

  /**
   * Handle importing a workflow
   */
  const handleImportWorkflow = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  /**
   * Toggle the workflows collapsible section
   */
  const handleToggleWorkflowsExpand = useCallback(() => {
    setIsWorkflowsExpanded((prev) => !prev)
  }, [])

  const canEdit = globalWorkspace.permissions === 'admin' || globalWorkspace.permissions === 'write'

  return (
    <div className='global-workflows-section relative flex flex-1 flex-col overflow-hidden' style={{ maxHeight: '50%' }}>
      {/* Section Title */}
      <div className='flex flex-shrink-0 flex-col space-y-[4px] px-[14px]'>
        <div className='flex items-center gap-[6px] font-medium text-[var(--text-tertiary)] text-small'>
          <Globe className='h-[14px] w-[14px]' />
          <span>Globally shared</span>
        </div>
      </div>

      {/* Collapsible Workflows Header */}
      <div className='mt-[8px] px-[8px]'>
        <div
          className={cn(
            'flex items-center justify-between rounded-[6px] px-[6px] py-[4px]',
            'hover:bg-[var(--surface-6)] dark:hover:bg-[var(--surface-5)]',
            'cursor-pointer transition-colors'
          )}
        >
          <button
            onClick={handleToggleWorkflowsExpand}
            className='flex items-center gap-[6px] text-[13px] font-medium text-[var(--text-secondary)]'
          >
            <ChevronRight
              className={cn(
                'h-[12px] w-[12px] transition-transform duration-200',
                isWorkflowsExpanded && 'rotate-90'
              )}
            />
            <Workflow className='h-[12px] w-[12px]' />
            <span>Workflows</span>
          </button>

          {/* Action buttons */}
          <div className='flex items-center gap-[6px]'>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <Button
                  variant='ghost'
                  className='h-[20px] w-[20px] p-0'
                  onClick={(e) => {
                    e.stopPropagation()
                    handleImportWorkflow()
                  }}
                  disabled={isImporting || !canEdit}
                >
                  <ArrowDown className='h-[12px] w-[12px]' />
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content className='py-[2.5px]'>
                <p>{isImporting ? 'Importing workflow...' : 'Import workflow'}</p>
              </Tooltip.Content>
            </Tooltip.Root>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <Button
                  variant='ghost'
                  className='h-[20px] w-[20px] p-0'
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCreateFolder()
                  }}
                  disabled={createFolderMutation.isPending || !canEdit}
                >
                  <FolderPlus className='h-[12px] w-[12px]' />
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content className='py-[2.5px]'>
                <p>{createFolderMutation.isPending ? 'Creating folder...' : 'Create folder'}</p>
              </Tooltip.Content>
            </Tooltip.Root>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <Button
                  variant='outline'
                  className='h-[20px] w-[20px] p-0'
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCreateWorkflow()
                  }}
                  disabled={createWorkflowMutation.isPending || !canEdit}
                >
                  <Plus className='h-[12px] w-[12px]' />
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content className='py-[2.5px]'>
                <p>{createWorkflowMutation.isPending ? 'Creating workflow...' : 'Create workflow'}</p>
              </Tooltip.Content>
            </Tooltip.Root>
          </div>
        </div>
      </div>

      {/* Collapsible Workflow List */}
      {isWorkflowsExpanded && (
        <div
          ref={scrollContainerRef}
          className='mt-[4px] flex-1 overflow-y-auto overflow-x-hidden px-[8px]'
        >
          <WorkflowList
            regularWorkflows={globalWorkflows}
            isLoading={isLoading}
            isImporting={isImporting}
            setIsImporting={setIsImporting}
            fileInputRef={fileInputRef}
            scrollContainerRef={scrollContainerRef}
            isGlobalSection={true}
            globalWorkspaceId={globalWorkspace.id}
            regularWorkspaces={regularWorkspaces}
          />
        </div>
      )}

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type='file'
        accept='.json,.zip'
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  )
}
