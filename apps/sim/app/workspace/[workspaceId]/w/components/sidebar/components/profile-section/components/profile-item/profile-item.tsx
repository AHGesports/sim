'use client'

import { useCallback } from 'react'
import { Check, Pencil, Trash2 } from 'lucide-react'
import { Button, Tooltip } from '@/components/emcn'
import type { AgentProfile } from '@/lib/profiles/types'
import { cn } from '@/lib/utils'

interface ProfileItemProps {
  profile: AgentProfile
  isActivated: boolean
  isExecuting: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}

/**
 * Individual profile row component with toggle, edit, and delete buttons.
 */
export function ProfileItem({
  profile,
  isActivated,
  isExecuting,
  onToggle,
  onEdit,
  onDelete,
}: ProfileItemProps) {
  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!isExecuting) {
        onToggle()
      }
    },
    [isExecuting, onToggle]
  )

  const handleEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onEdit()
    },
    [onEdit]
  )

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onDelete()
    },
    [onDelete]
  )

  return (
    <div
      className={cn(
        'group flex h-[26px] items-center gap-[8px] rounded-[8px] px-[6px] text-[14px]',
        'hover:bg-[var(--surface-6)] dark:hover:bg-[var(--surface-5)]'
      )}
    >
      {/* Toggle Button */}
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type='button'
            className={cn(
              'flex h-[14px] w-[14px] flex-shrink-0 items-center justify-center rounded-[4px] transition-colors',
              isActivated
                ? 'bg-[var(--accent)] text-white'
                : 'border border-[var(--border)] bg-transparent',
              isExecuting && 'cursor-not-allowed opacity-50'
            )}
            onClick={handleToggle}
            disabled={isExecuting}
          >
            {isActivated && <Check className='h-[10px] w-[10px]' />}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Content className='py-[2.5px]'>
          <p>
            {isExecuting
              ? 'Cannot toggle during execution'
              : isActivated
                ? 'Deactivate profile'
                : 'Activate profile'}
          </p>
        </Tooltip.Content>
      </Tooltip.Root>

      {/* Profile Name */}
      <div className='min-w-0 flex-1'>
        <div
          className={cn(
            'truncate font-medium',
            'text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)]'
          )}
        >
          {profile.name}
        </div>
      </div>

      {/* Action Buttons - Visible on hover */}
      <div className='flex items-center gap-[4px] opacity-0 transition-opacity group-hover:opacity-100'>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Button variant='ghost' className='h-[18px] w-[18px] p-0' onClick={handleEdit}>
              <Pencil className='h-[12px] w-[12px] text-[var(--text-tertiary)]' />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content className='py-[2.5px]'>
            <p>Edit profile</p>
          </Tooltip.Content>
        </Tooltip.Root>

        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Button variant='ghost' className='h-[18px] w-[18px] p-0' onClick={handleDelete}>
              <Trash2 className='h-[12px] w-[12px] text-[var(--text-tertiary)]' />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content className='py-[2.5px]'>
            <p>Delete profile</p>
          </Tooltip.Content>
        </Tooltip.Root>
      </div>
    </div>
  )
}
