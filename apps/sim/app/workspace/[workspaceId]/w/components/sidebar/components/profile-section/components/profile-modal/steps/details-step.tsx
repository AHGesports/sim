'use client'

import { useCallback } from 'react'
import { Button, Input, Label } from '@/components/emcn'

interface DetailsStepProps {
  name: string
  onNameChange: (name: string) => void
  onNext: () => void
  onBack: () => void
  errors?: {
    name?: string
  }
}

/**
 * Step 2: Profile details step for the profile creation modal.
 */
export function DetailsStep({ name, onNameChange, onNext, onBack, errors }: DetailsStepProps) {
  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onNameChange(e.target.value)
    },
    [onNameChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && name.trim()) {
        onNext()
      }
    },
    [name, onNext]
  )

  const isValid = name.trim().length > 0

  return (
    <div className='flex flex-col gap-[16px]'>
      <div>
        <h3 className='font-semibold text-[var(--text-primary)] text-base'>Profile Details</h3>
        <p className='mt-[4px] text-[var(--text-tertiary)] text-small'>
          Give your profile a name to identify it
        </p>
      </div>

      <div className='flex flex-col gap-[8px]'>
        <Label htmlFor='profile-name'>Profile Name</Label>
        <Input
          id='profile-name'
          type='text'
          value={name}
          onChange={handleNameChange}
          onKeyDown={handleKeyDown}
          placeholder='e.g., Agent Alpha'
          autoFocus
          maxLength={100}
        />
        {errors?.name && <p className='text-[var(--error)] text-xs'>{errors.name}</p>}
      </div>

      {/* Profile Data Section - Coming Soon */}
      <div className='rounded-[8px] border border-[var(--border)] border-dashed bg-[var(--surface-3)] p-[12px]'>
        <p className='text-center text-[var(--text-tertiary)] text-small'>
          Custom profile data coming soon
        </p>
      </div>

      <div className='flex items-center justify-between pt-[8px]'>
        <Button variant='ghost' onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!isValid}>
          Next
        </Button>
      </div>
    </div>
  )
}
