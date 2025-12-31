'use client'

import { useCallback } from 'react'
import { Chrome, Globe } from 'lucide-react'
import { Button } from '@/components/emcn'
import { BrowserProfileProvider } from '@/lib/profiles/types'
import { cn } from '@/lib/utils'

interface ProviderStepProps {
  selectedProvider: BrowserProfileProvider | null
  onSelect: (provider: BrowserProfileProvider) => void
  onNext: () => void
  onSkip: () => void
}

const providers = [
  {
    id: BrowserProfileProvider.OwnBrowser,
    name: 'Own Browser',
    description: 'Use your local browser for automation',
    icon: Chrome,
    canSkip: true,
  },
  {
    id: BrowserProfileProvider.MoreLogin,
    name: 'MoreLogin',
    description: 'Anti-detect browser profiles for multi-account management',
    icon: Globe,
    canSkip: false,
  },
]

/**
 * Step 1: Provider selection step for the profile creation modal.
 */
export function ProviderStep({ selectedProvider, onSelect, onNext, onSkip }: ProviderStepProps) {
  const handleProviderClick = useCallback(
    (provider: BrowserProfileProvider) => {
      onSelect(provider)
    },
    [onSelect]
  )

  const handleSkip = useCallback(() => {
    onSelect(BrowserProfileProvider.OwnBrowser)
    onSkip()
  }, [onSelect, onSkip])

  return (
    <div className='flex flex-col gap-[16px]'>
      <div>
        <h3 className='font-semibold text-[var(--text-primary)] text-base'>
          Select Browser Provider
        </h3>
        <p className='mt-[4px] text-[var(--text-tertiary)] text-small'>
          Choose how this profile will connect to browsers
        </p>
      </div>

      <div className='flex flex-col gap-[8px]'>
        {providers.map((provider) => {
          const Icon = provider.icon
          const isSelected = selectedProvider === provider.id

          return (
            <button
              key={provider.id}
              type='button'
              className={cn(
                'flex items-start gap-[12px] rounded-[8px] border p-[12px] text-left transition-colors',
                isSelected
                  ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
                  : 'border-[var(--border)] hover:border-[var(--border-1)] hover:bg-[var(--surface-6)]'
              )}
              onClick={() => handleProviderClick(provider.id)}
            >
              <div
                className={cn(
                  'flex h-[32px] w-[32px] flex-shrink-0 items-center justify-center rounded-[6px]',
                  isSelected ? 'bg-[var(--accent)]' : 'bg-[var(--surface-5)]'
                )}
              >
                <Icon
                  className={cn(
                    'h-[16px] w-[16px]',
                    isSelected ? 'text-white' : 'text-[var(--text-secondary)]'
                  )}
                />
              </div>
              <div className='flex flex-col'>
                <span className='font-medium text-[var(--text-primary)] text-small'>
                  {provider.name}
                </span>
                <span className='text-[var(--text-tertiary)] text-xs'>{provider.description}</span>
              </div>
            </button>
          )
        })}
      </div>

      <div className='flex items-center justify-between pt-[8px]'>
        <Button variant='ghost' onClick={handleSkip}>
          Skip (Use Own Browser)
        </Button>
        <Button onClick={onNext} disabled={!selectedProvider}>
          Next
        </Button>
      </div>
    </div>
  )
}
