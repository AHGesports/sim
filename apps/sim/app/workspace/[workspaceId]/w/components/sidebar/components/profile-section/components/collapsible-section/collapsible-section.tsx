'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { Button, Tooltip } from '@/components/emcn'

interface CollapsibleSectionProps {
  title: string
  storageKey: string
  defaultExpanded?: boolean
  onAdd: () => void
  addDisabled?: boolean
  addTooltip?: string
  children: React.ReactNode
}

/**
 * Reusable collapsible section component with title and add button.
 * Persists expanded state to localStorage.
 */
export function CollapsibleSection({
  title,
  storageKey,
  defaultExpanded = true,
  onAdd,
  addDisabled = false,
  addTooltip = 'Add',
  children,
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const [hasHydrated, setHasHydrated] = useState(false)

  // Load expanded state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(`collapsible-${storageKey}`)
    if (stored !== null) {
      setIsExpanded(stored === 'true')
    }
    setHasHydrated(true)
  }, [storageKey])

  // Save expanded state to localStorage
  const handleToggle = useCallback(() => {
    const newState = !isExpanded
    setIsExpanded(newState)
    localStorage.setItem(`collapsible-${storageKey}`, String(newState))
  }, [isExpanded, storageKey])

  // Don't render children until hydrated to prevent mismatch
  const showContent = hasHydrated && isExpanded

  return (
    <div className='flex flex-col'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <button
          type='button'
          className='flex items-center gap-[4px] font-medium text-[var(--text-tertiary)] text-small hover:text-[var(--text-secondary)]'
          onClick={handleToggle}
        >
          {isExpanded ? (
            <ChevronDown className='h-[12px] w-[12px]' />
          ) : (
            <ChevronRight className='h-[12px] w-[12px]' />
          )}
          <span>{title}</span>
        </button>

        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Button
              variant='outline'
              className='translate-y-[-0.25px] p-[1px]'
              onClick={onAdd}
              disabled={addDisabled}
            >
              <Plus className='h-[14px] w-[14px]' />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content className='py-[2.5px]'>
            <p>{addTooltip}</p>
          </Tooltip.Content>
        </Tooltip.Root>
      </div>

      {/* Content */}
      {showContent && <div className='mt-[6px]'>{children}</div>}
    </div>
  )
}
