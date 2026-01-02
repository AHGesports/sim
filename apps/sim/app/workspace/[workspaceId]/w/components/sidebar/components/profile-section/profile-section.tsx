'use client'

import { useCallback, useState } from 'react'
import { createLogger } from '@sim/logger'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Button, Tooltip } from '@/components/emcn'
import { type AgentProfile, ProfileScope } from '@/lib/profiles/types'
import { useDeleteProfile, useProfilesForWorkspace } from '@/hooks/queries/profiles'
import { useExecutionStore } from '@/stores/execution/store'
import { useProfileStore } from '@/stores/profiles/store'
import { CollapsibleSection, ProfileList, ProfileModal } from './components'

const logger = createLogger('ProfileSection')

interface ProfileSectionProps {
  workspaceId: string
}

/**
 * Main profile section container displayed in the sidebar.
 * Contains two collapsible sections: "Global Agents" and "Workspace Agents".
 */
export function ProfileSection({ workspaceId }: ProfileSectionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalScope, setModalScope] = useState<ProfileScope>(ProfileScope.Global)
  const [editingProfile, setEditingProfile] = useState<AgentProfile | null>(null)

  // Fetch profiles
  const { isLoading } = useProfilesForWorkspace(workspaceId)

  // Get profiles from store
  const getGlobalProfiles = useProfileStore((state) => state.getGlobalProfiles)
  const getWorkspaceProfiles = useProfileStore((state) => state.getWorkspaceProfiles)
  const getWorkspacesWithActivatedProfile = useProfileStore(
    (state) => state.getWorkspacesWithActivatedProfile
  )

  const globalProfiles = getGlobalProfiles()
  const workspaceProfiles = getWorkspaceProfiles(workspaceId)

  // Check if workflow is executing
  const isExecuting = useExecutionStore((state) => state.isExecuting)

  // Delete mutation
  const deleteProfile = useDeleteProfile()

  // Open modal for creating new profile
  const handleOpenCreateModal = useCallback((scope: ProfileScope) => {
    setModalScope(scope)
    setEditingProfile(null)
    setIsModalOpen(true)
  }, [])

  // Open modal for editing profile
  const handleOpenEditModal = useCallback((profile: AgentProfile) => {
    setModalScope(profile.scope as ProfileScope)
    setEditingProfile(profile)
    setIsModalOpen(true)
  }, [])

  // Handle delete profile
  const handleDeleteProfile = useCallback(
    async (profile: AgentProfile) => {
      // Check if global profile is activated in other workspaces
      if (profile.scope === ProfileScope.Global) {
        const activatedWorkspaces = getWorkspacesWithActivatedProfile(profile.id)
        if (activatedWorkspaces.length > 0) {
          const confirmed = window.confirm(
            `This profile is active in ${activatedWorkspaces.length} workspace(s). Delete anyway?`
          )
          if (!confirmed) return
        }
      }

      try {
        await deleteProfile.mutateAsync({
          workspaceId,
          profileId: profile.id,
        })
        logger.info(`Profile deleted: ${profile.id}`)
      } catch (error) {
        logger.error('Failed to delete profile', { error })
      }
    },
    [workspaceId, deleteProfile, getWorkspacesWithActivatedProfile]
  )

  // Handle modal close
  const handleModalClose = useCallback((open: boolean) => {
    if (!open) {
      setIsModalOpen(false)
      setEditingProfile(null)
    }
  }, [])

  return (
    <div className='flex flex-col gap-[12px]'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <span className='font-medium text-[var(--text-tertiary)] text-small'>Profiles</span>
        <div className='flex items-center gap-[6px]'>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <Button variant='ghost' className='p-[1px]' disabled>
                <ArrowDown className='h-[14px] w-[14px]' />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content className='py-[2.5px]'>
              <p>Import profiles (coming soon)</p>
            </Tooltip.Content>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <Button variant='ghost' className='p-[1px]' disabled>
                <ArrowUp className='h-[14px] w-[14px]' />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content className='py-[2.5px]'>
              <p>Export profiles (coming soon)</p>
            </Tooltip.Content>
          </Tooltip.Root>
        </div>
      </div>

      {/* Global Agents */}
      <CollapsibleSection
        title='Global Agents'
        storageKey='global-agents'
        onAdd={() => handleOpenCreateModal(ProfileScope.Global)}
        addTooltip='Create global agent'
      >
        {isLoading ? (
          <div className='px-[6px] py-[8px] text-center font-medium text-[var(--text-subtle)] text-small'>
            Loading...
          </div>
        ) : (
          <ProfileList
            profiles={globalProfiles}
            workspaceId={workspaceId}
            isExecuting={isExecuting}
            onEdit={handleOpenEditModal}
            onDelete={handleDeleteProfile}
          />
        )}
      </CollapsibleSection>

      {/* Workspace Agents */}
      <CollapsibleSection
        title='Workspace Agents'
        storageKey='workspace-agents'
        onAdd={() => handleOpenCreateModal(ProfileScope.Workspace)}
        addTooltip='Create workspace agent'
      >
        {isLoading ? (
          <div className='px-[6px] py-[8px] text-center font-medium text-[var(--text-subtle)] text-small'>
            Loading...
          </div>
        ) : (
          <ProfileList
            profiles={workspaceProfiles}
            workspaceId={workspaceId}
            isExecuting={isExecuting}
            onEdit={handleOpenEditModal}
            onDelete={handleDeleteProfile}
          />
        )}
      </CollapsibleSection>

      {/* Profile Modal */}
      <ProfileModal
        open={isModalOpen}
        onOpenChange={handleModalClose}
        scope={modalScope}
        workspaceId={workspaceId}
        editingProfile={editingProfile}
      />
    </div>
  )
}
