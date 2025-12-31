'use client'

import { useCallback } from 'react'
import type { AgentProfile } from '@/lib/profiles/types'
import { useProfileStore } from '@/stores/profiles/store'
import { ProfileItem } from '../profile-item/profile-item'

interface ProfileListProps {
  profiles: AgentProfile[]
  workspaceId: string
  isExecuting: boolean
  onEdit: (profile: AgentProfile) => void
  onDelete: (profile: AgentProfile) => void
}

/**
 * Reusable profile list component that displays a list of profiles.
 * Used for both "My Profiles" (global) and "Workspace Profiles" sections.
 */
export function ProfileList({
  profiles,
  workspaceId,
  isExecuting,
  onEdit,
  onDelete,
}: ProfileListProps) {
  const toggleProfile = useProfileStore((state) => state.toggleProfile)
  const isProfileActivated = useProfileStore((state) => state.isProfileActivated)

  const handleToggle = useCallback(
    (profileId: string) => {
      toggleProfile(workspaceId, profileId)
    },
    [workspaceId, toggleProfile]
  )

  if (profiles.length === 0) {
    return (
      <div className='px-[6px] py-[8px] text-center font-medium text-[var(--text-subtle)] text-small'>
        No profiles yet
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-[2px]'>
      {profiles.map((profile) => (
        <ProfileItem
          key={profile.id}
          profile={profile}
          isActivated={isProfileActivated(workspaceId, profile.id)}
          isExecuting={isExecuting}
          onToggle={() => handleToggle(profile.id)}
          onEdit={() => onEdit(profile)}
          onDelete={() => onDelete(profile)}
        />
      ))}
    </div>
  )
}
