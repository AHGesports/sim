'use client'

import { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { type AgentProfile, BrowserProfileProvider, ProfileScope } from '@/lib/profiles/types'
import { useCreateProfile, useUpdateProfile } from '@/hooks/queries/profiles'
import { DetailsStep, OverviewStep, ProviderStep } from './steps'

type Step = 'provider' | 'details' | 'overview'

interface ProfileModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scope: ProfileScope
  workspaceId: string
  editingProfile?: AgentProfile | null
}

/**
 * Multi-step modal for creating or editing profiles.
 */
export function ProfileModal({
  open,
  onOpenChange,
  scope,
  workspaceId,
  editingProfile,
}: ProfileModalProps) {
  const [currentStep, setCurrentStep] = useState<Step>('provider')
  const [selectedProvider, setSelectedProvider] = useState<BrowserProfileProvider | null>(null)
  const [profileName, setProfileName] = useState('')
  const [errors, setErrors] = useState<{ name?: string }>({})

  const createProfile = useCreateProfile()
  const updateProfile = useUpdateProfile()

  const isEditing = Boolean(editingProfile)
  const isSubmitting = createProfile.isPending || updateProfile.isPending

  // Reset form when modal opens/closes or editingProfile changes
  useEffect(() => {
    if (open) {
      if (editingProfile) {
        // Edit mode: pre-fill form
        setSelectedProvider(
          editingProfile.browserProfile?.providerType || BrowserProfileProvider.OwnBrowser
        )
        setProfileName(editingProfile.name)
        setCurrentStep('details') // Skip provider step in edit mode
      } else {
        // Create mode: reset form
        setSelectedProvider(null)
        setProfileName('')
        setCurrentStep('provider')
      }
      setErrors({})
    }
  }, [open, editingProfile])

  const handleClose = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  const handleProviderSelect = useCallback((provider: BrowserProfileProvider) => {
    setSelectedProvider(provider)
  }, [])

  const handleProviderNext = useCallback(() => {
    if (selectedProvider) {
      setCurrentStep('details')
    }
  }, [selectedProvider])

  const handleProviderSkip = useCallback(() => {
    setSelectedProvider(BrowserProfileProvider.OwnBrowser)
    setCurrentStep('details')
  }, [])

  const handleDetailsNext = useCallback(() => {
    if (!profileName.trim()) {
      setErrors({ name: 'Name is required' })
      return
    }
    setErrors({})
    setCurrentStep('overview')
  }, [profileName])

  const handleDetailsBack = useCallback(() => {
    if (isEditing) {
      handleClose()
    } else {
      setCurrentStep('provider')
    }
  }, [isEditing, handleClose])

  const handleOverviewBack = useCallback(() => {
    setCurrentStep('details')
  }, [])

  const handleConfirm = useCallback(async () => {
    if (!selectedProvider || !profileName.trim()) return

    try {
      if (isEditing && editingProfile) {
        // Update existing profile
        await updateProfile.mutateAsync({
          workspaceId,
          profileId: editingProfile.id,
          updates: {
            name: profileName.trim(),
          },
        })
      } else {
        // Create new profile
        await createProfile.mutateAsync({
          workspaceId,
          name: profileName.trim(),
          scope,
          providerType: selectedProvider,
        })
      }
      handleClose()
    } catch (error) {
      // Error handling is done in the mutation hooks
    }
  }, [
    selectedProvider,
    profileName,
    isEditing,
    editingProfile,
    workspaceId,
    scope,
    createProfile,
    updateProfile,
    handleClose,
  ])

  const getTitle = () => {
    if (isEditing) {
      return 'Edit Profile'
    }
    return scope === ProfileScope.Global ? 'Create Global Agent' : 'Create Workspace Agent'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-[400px]'>
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
        </DialogHeader>

        <div className='mt-[16px]'>
          {currentStep === 'provider' && !isEditing && (
            <ProviderStep
              selectedProvider={selectedProvider}
              onSelect={handleProviderSelect}
              onNext={handleProviderNext}
              onSkip={handleProviderSkip}
            />
          )}

          {currentStep === 'details' && (
            <DetailsStep
              name={profileName}
              onNameChange={setProfileName}
              onNext={handleDetailsNext}
              onBack={handleDetailsBack}
              errors={errors}
            />
          )}

          {currentStep === 'overview' && selectedProvider && (
            <OverviewStep
              provider={selectedProvider}
              name={profileName}
              scope={scope}
              onBack={handleOverviewBack}
              onConfirm={handleConfirm}
              isSubmitting={isSubmitting}
              isEditing={isEditing}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
