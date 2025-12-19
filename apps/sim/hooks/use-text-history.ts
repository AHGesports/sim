import { useCallback, useEffect, useRef } from 'react'
import { useTextHistoryStore } from '@/stores/text-history'

interface UseTextHistoryOptions {
  /** Block ID for the text field */
  blockId: string
  /** Sub-block ID for the text field */
  subBlockId: string
  /** Current value of the text field */
  value: string
  /** Callback to update the value */
  onChange: (value: string) => void
  /** Whether the field is disabled/readonly */
  disabled?: boolean
}

interface UseTextHistoryResult {
  /**
   * Handle text change - records to history with debouncing
   */
  handleChange: (newValue: string) => void

  /**
   * Handle keyboard events for undo/redo
   * Returns true if the event was handled
   */
  handleKeyDown: (e: React.KeyboardEvent) => boolean

  /**
   * Handle blur - commits any pending changes
   */
  handleBlur: () => void

  /**
   * Undo the last change
   */
  undo: () => void

  /**
   * Redo the last undone change
   */
  redo: () => void

  /**
   * Whether undo is available
   */
  canUndo: boolean

  /**
   * Whether redo is available
   */
  canRedo: boolean
}

/**
 * Hook for managing text undo/redo history for a specific text field.
 *
 * @remarks
 * - Provides debounced history recording (coalesces rapid changes)
 * - Handles Cmd+Z/Ctrl+Z for undo, Cmd+Shift+Z/Ctrl+Y for redo
 * - Commits pending changes on blur to preserve history
 * - Each blockId:subBlockId pair has its own independent history
 *
 * @example
 * ```tsx
 * const { handleChange, handleKeyDown, handleBlur } = useTextHistory({
 *   blockId,
 *   subBlockId,
 *   value: code,
 *   onChange: (newCode) => {
 *     setCode(newCode)
 *     setStoreValue(newCode)
 *   },
 * })
 *
 * <textarea
 *   value={code}
 *   onChange={(e) => handleChange(e.target.value)}
 *   onKeyDown={handleKeyDown}
 *   onBlur={handleBlur}
 * />
 * ```
 */
export function useTextHistory({
  blockId,
  subBlockId,
  value,
  onChange,
  disabled = false,
}: UseTextHistoryOptions): UseTextHistoryResult {
  const store = useTextHistoryStore()
  const initializedRef = useRef(false)
  const lastExternalValueRef = useRef(value)

  // Initialize history on mount
  useEffect(() => {
    if (!initializedRef.current && blockId && subBlockId) {
      store.initHistory(blockId, subBlockId, value)
      initializedRef.current = true
    }
  }, [blockId, subBlockId, value, store])

  // Handle external value changes (e.g., from AI generation or store sync)
  useEffect(() => {
    if (value !== lastExternalValueRef.current) {
      // This is an external change, commit any pending and record the new value
      store.commitPending(blockId, subBlockId)
      store.recordChange(blockId, subBlockId, value)
      store.commitPending(blockId, subBlockId)
      lastExternalValueRef.current = value
    }
  }, [value, blockId, subBlockId, store])

  const handleChange = useCallback(
    (newValue: string) => {
      if (disabled) return

      // Update the external value immediately
      onChange(newValue)
      lastExternalValueRef.current = newValue

      // Record to history with debouncing
      store.recordChange(blockId, subBlockId, newValue)
    },
    [blockId, subBlockId, onChange, disabled, store]
  )

  const undo = useCallback(() => {
    if (disabled) return

    const previousValue = store.undo(blockId, subBlockId)
    if (previousValue !== null) {
      onChange(previousValue)
      lastExternalValueRef.current = previousValue
    }
  }, [blockId, subBlockId, onChange, disabled, store])

  const redo = useCallback(() => {
    if (disabled) return

    const nextValue = store.redo(blockId, subBlockId)
    if (nextValue !== null) {
      onChange(nextValue)
      lastExternalValueRef.current = nextValue
    }
  }, [blockId, subBlockId, onChange, disabled, store])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (disabled) return false

      const isMod = e.metaKey || e.ctrlKey

      // Undo: Cmd+Z / Ctrl+Z
      if (isMod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        undo()
        return true
      }

      // Redo: Cmd+Shift+Z / Ctrl+Shift+Z / Ctrl+Y
      if (
        (isMod && e.key === 'z' && e.shiftKey) ||
        (isMod && e.key === 'Z') ||
        (e.ctrlKey && e.key === 'y')
      ) {
        e.preventDefault()
        e.stopPropagation()
        redo()
        return true
      }

      return false
    },
    [disabled, undo, redo]
  )

  const handleBlur = useCallback(() => {
    // Commit any pending changes when the field loses focus
    store.commitPending(blockId, subBlockId)
  }, [blockId, subBlockId, store])

  const canUndo = store.canUndo(blockId, subBlockId)
  const canRedo = store.canRedo(blockId, subBlockId)

  return {
    handleChange,
    handleKeyDown,
    handleBlur,
    undo,
    redo,
    canUndo,
    canRedo,
  }
}
