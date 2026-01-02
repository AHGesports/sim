'use client'

import { Chrome, Globe, Loader2 } from 'lucide-react'
import { Button } from '@/components/emcn'
import { BrowserProfileProvider, ProfileScope } from '@/lib/profiles/types'

interface OverviewStepProps {
  provider: BrowserProfileProvider
  name: string
  scope: ProfileScope
  onBack: () => void
  onConfirm: () => void
  isSubmitting: boolean
  isEditing?: boolean
}

const providerInfo = {
  [BrowserProfileProvider.OwnBrowser]: {
    name: 'Own Browser',
    icon: Chrome,
  },
  [BrowserProfileProvider.MoreLogin]: {
    name: 'MoreLogin',
    icon: Globe,
  },
}

/**
 * Step 3: Overview and confirmation step for the profile creation modal.
 */
export function OverviewStep({
  provider,
  name,
  scope,
  onBack,
  onConfirm,
  isSubmitting,
  isEditing = false,
}: OverviewStepProps) {
  const providerDetails = providerInfo[provider]
  const Icon = providerDetails.icon

  return (
    <div className='flex flex-col gap-[16px]'>
      <div>
        <h3 className='font-semibold text-[var(--text-primary)] text-base'>
          {isEditing ? 'Review Changes' : 'Review & Create'}
        </h3>
        <p className='mt-[4px] text-[var(--text-tertiary)] text-small'>
          {isEditing
            ? 'Review your changes before saving'
            : 'Review your profile settings before creating'}
        </p>
      </div>

      {/* Summary */}
      <div className='flex flex-col gap-[12px] rounded-[8px] border border-[var(--border)] bg-[var(--surface-3)] p-[12px]'>
        {/* Provider */}
        <div className='flex items-center justify-between'>
          <span className='text-[var(--text-tertiary)] text-small'>Browser Provider</span>
          <div className='flex items-center gap-[6px]'>
            <Icon className='h-[14px] w-[14px] text-[var(--text-secondary)]' />
            <span className='font-medium text-[var(--text-primary)] text-small'>
              {providerDetails.name}
            </span>
          </div>
        </div>

        {/* Name */}
        <div className='flex items-center justify-between'>
          <span className='text-[var(--text-tertiary)] text-small'>Profile Name</span>
          <span className='font-medium text-[var(--text-primary)] text-small'>{name}</span>
        </div>

        {/* Availability */}
        <div className='flex items-center justify-between'>
          <span className='text-[var(--text-tertiary)] text-small'>Availability</span>
          <span className='font-medium text-[var(--text-primary)] text-small'>
            {scope === ProfileScope.Global ? 'All workspaces' : 'This workspace only'}
          </span>
        </div>
      </div>

      <div className='flex items-center justify-between pt-[8px]'>
        <Button variant='ghost' onClick={onBack} disabled={isSubmitting}>
          Back
        </Button>
        <Button onClick={onConfirm} disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className='mr-[6px] h-[14px] w-[14px] animate-spin' />
              {isEditing ? 'Saving...' : 'Creating...'}
            </>
          ) : isEditing ? (
            'Save Changes'
          ) : (
            'Create Agent'
          )}
        </Button>
      </div>
    </div>
  )
}
