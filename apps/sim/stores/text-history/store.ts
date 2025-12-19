import { create } from 'zustand'
import { createLogger } from '@/lib/logs/console/logger'

const logger = createLogger('TextHistoryStore')

/**
 * Default debounce delay in milliseconds.
 * Changes within this window are coalesced into a single history entry.
 */
const DEBOUNCE_DELAY_MS = 500

/**
 * Maximum number of history entries per text field.
 */
const MAX_HISTORY_SIZE = 10

interface TextHistoryEntry {
  /** The undo/redo stack of text values */
  stack: string[]
  /** Current position in the stack (0 = oldest) */
  index: number
  /** Pending value that hasn't been committed to history yet */
  pending: string | null
  /** Timer ID for debounced commit */
  debounceTimer: ReturnType<typeof setTimeout> | null
  /** Timestamp of last change (for coalescing logic) */
  lastChangeAt: number
}

interface TextHistoryState {
  /** Map of "blockId:subBlockId" to history entry */
  histories: Record<string, TextHistoryEntry>

  /**
   * Records a text change with debouncing.
   * Multiple rapid changes are coalesced into a single history entry.
   */
  recordChange: (blockId: string, subBlockId: string, value: string) => void

  /**
   * Immediately commits any pending changes to history.
   * Call this on blur or before navigation.
   */
  commitPending: (blockId: string, subBlockId: string) => void

  /**
   * Undo the last text change for a specific field.
   * @returns The previous value, or null if at the beginning of history
   */
  undo: (blockId: string, subBlockId: string) => string | null

  /**
   * Redo the last undone text change for a specific field.
   * @returns The next value, or null if at the end of history
   */
  redo: (blockId: string, subBlockId: string) => string | null

  /**
   * Check if undo is available for a field.
   */
  canUndo: (blockId: string, subBlockId: string) => boolean

  /**
   * Check if redo is available for a field.
   */
  canRedo: (blockId: string, subBlockId: string) => boolean

  /**
   * Initialize history for a field with an initial value.
   * Called when a text field first mounts.
   */
  initHistory: (blockId: string, subBlockId: string, initialValue: string) => void

  /**
   * Clear history for a specific field.
   */
  clearHistory: (blockId: string, subBlockId: string) => void

  /**
   * Clear all history for a block (when block is deleted).
   */
  clearBlockHistory: (blockId: string) => void
}

function getKey(blockId: string, subBlockId: string): string {
  return `${blockId}:${subBlockId}`
}

function createEmptyEntry(initialValue: string): TextHistoryEntry {
  return {
    stack: [initialValue],
    index: 0,
    pending: null,
    debounceTimer: null,
    lastChangeAt: 0,
  }
}

export const useTextHistoryStore = create<TextHistoryState>((set, get) => ({
  histories: {},

  initHistory: (blockId: string, subBlockId: string, initialValue: string) => {
    const key = getKey(blockId, subBlockId)
    const state = get()

    // Only initialize if not already present
    if (!state.histories[key]) {
      set({
        histories: {
          ...state.histories,
          [key]: createEmptyEntry(initialValue),
        },
      })
      logger.debug('Initialized text history', { blockId, subBlockId })
    }
  },

  recordChange: (blockId: string, subBlockId: string, value: string) => {
    const key = getKey(blockId, subBlockId)
    const state = get()
    let entry = state.histories[key]

    // Initialize if needed
    if (!entry) {
      entry = createEmptyEntry('')
    }

    // Clear any existing debounce timer
    if (entry.debounceTimer) {
      clearTimeout(entry.debounceTimer)
    }

    // Set up new debounce timer
    const timer = setTimeout(() => {
      get().commitPending(blockId, subBlockId)
    }, DEBOUNCE_DELAY_MS)

    // Update entry with pending value
    set({
      histories: {
        ...get().histories,
        [key]: {
          ...entry,
          pending: value,
          debounceTimer: timer,
          lastChangeAt: Date.now(),
        },
      },
    })
  },

  commitPending: (blockId: string, subBlockId: string) => {
    const key = getKey(blockId, subBlockId)
    const state = get()
    const entry = state.histories[key]

    if (!entry || entry.pending === null) {
      return
    }

    // Clear the timer
    if (entry.debounceTimer) {
      clearTimeout(entry.debounceTimer)
    }

    const currentValue = entry.stack[entry.index]

    // Don't commit if value hasn't changed
    if (entry.pending === currentValue) {
      set({
        histories: {
          ...state.histories,
          [key]: {
            ...entry,
            pending: null,
            debounceTimer: null,
          },
        },
      })
      return
    }

    // Truncate any redo history (we're branching)
    const newStack = entry.stack.slice(0, entry.index + 1)

    // Add the new value
    newStack.push(entry.pending)

    // Enforce max size (remove oldest entries)
    while (newStack.length > MAX_HISTORY_SIZE) {
      newStack.shift()
    }

    const newIndex = newStack.length - 1

    set({
      histories: {
        ...state.histories,
        [key]: {
          stack: newStack,
          index: newIndex,
          pending: null,
          debounceTimer: null,
          lastChangeAt: entry.lastChangeAt,
        },
      },
    })

    logger.debug('Committed text change to history', {
      blockId,
      subBlockId,
      stackSize: newStack.length,
      index: newIndex,
    })
  },

  undo: (blockId: string, subBlockId: string) => {
    const key = getKey(blockId, subBlockId)
    const state = get()
    const entry = state.histories[key]

    if (!entry) {
      return null
    }

    // Commit any pending changes first
    if (entry.pending !== null) {
      get().commitPending(blockId, subBlockId)
      // Re-fetch after commit
      const updatedEntry = get().histories[key]
      if (!updatedEntry || updatedEntry.index <= 0) {
        return null
      }
      const newIndex = updatedEntry.index - 1
      set({
        histories: {
          ...get().histories,
          [key]: {
            ...updatedEntry,
            index: newIndex,
          },
        },
      })
      logger.debug('Text undo', { blockId, subBlockId, newIndex })
      return updatedEntry.stack[newIndex]
    }

    if (entry.index <= 0) {
      return null
    }

    const newIndex = entry.index - 1
    set({
      histories: {
        ...state.histories,
        [key]: {
          ...entry,
          index: newIndex,
        },
      },
    })

    logger.debug('Text undo', { blockId, subBlockId, newIndex })
    return entry.stack[newIndex]
  },

  redo: (blockId: string, subBlockId: string) => {
    const key = getKey(blockId, subBlockId)
    const state = get()
    const entry = state.histories[key]

    if (!entry || entry.index >= entry.stack.length - 1) {
      return null
    }

    const newIndex = entry.index + 1
    set({
      histories: {
        ...state.histories,
        [key]: {
          ...entry,
          index: newIndex,
        },
      },
    })

    logger.debug('Text redo', { blockId, subBlockId, newIndex })
    return entry.stack[newIndex]
  },

  canUndo: (blockId: string, subBlockId: string) => {
    const key = getKey(blockId, subBlockId)
    const entry = get().histories[key]
    if (!entry) return false
    // Can undo if we have pending changes or index > 0
    return entry.pending !== null || entry.index > 0
  },

  canRedo: (blockId: string, subBlockId: string) => {
    const key = getKey(blockId, subBlockId)
    const entry = get().histories[key]
    if (!entry) return false
    return entry.index < entry.stack.length - 1
  },

  clearHistory: (blockId: string, subBlockId: string) => {
    const key = getKey(blockId, subBlockId)
    const state = get()
    const entry = state.histories[key]

    if (entry?.debounceTimer) {
      clearTimeout(entry.debounceTimer)
    }

    const { [key]: _, ...rest } = state.histories
    set({ histories: rest })

    logger.debug('Cleared text history', { blockId, subBlockId })
  },

  clearBlockHistory: (blockId: string) => {
    const state = get()
    const prefix = `${blockId}:`
    const newHistories: Record<string, TextHistoryEntry> = {}

    for (const [key, entry] of Object.entries(state.histories)) {
      if (key.startsWith(prefix)) {
        if (entry.debounceTimer) {
          clearTimeout(entry.debounceTimer)
        }
      } else {
        newHistories[key] = entry
      }
    }

    set({ histories: newHistories })
    logger.debug('Cleared all text history for block', { blockId })
  },
}))
