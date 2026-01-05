'use client'

import { useCallback, useState } from 'react'
import {
  Button,
  Checkbox,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@/components/emcn'

interface Workspace {
  id: string
  name: string
  ownerId: string
  role?: string
}

interface WorkspaceSelectorModalProps {
  isOpen: boolean
  onClose: () => void
  workflowId: string
  workflowName: string
  workspaces: Workspace[]
}

/**
 * WorkspaceSelectorModal allows users to select agents where a global workflow should be executed.
 * Opens a new browser tab for each selected agent with autorun parameter.
 */
export function WorkspaceSelectorModal({
  isOpen,
  onClose,
  workflowId,
  workflowName,
  workspaces,
}: WorkspaceSelectorModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  /**
   * Toggle an agent selection
   */
  const handleToggle = useCallback((workspaceId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev)
      if (checked) {
        newSet.add(workspaceId)
      } else {
        newSet.delete(workspaceId)
      }
      return newSet
    })
  }, [])

  /**
   * Select all agents
   */
  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(workspaces.map((ws) => ws.id)))
  }, [workspaces])

  /**
   * Clear all selections
   */
  const handleClearAll = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  /**
   * Execute the global workflow in selected agents
   * Opens a new browser tab for each selected agent
   */
  const handleExecute = useCallback(() => {
    selectedIds.forEach((wsId) => {
      const url = `/workspace/${wsId}/w/${workflowId}?autorun=true&source=global`
      window.open(url, '_blank')
    })
    setSelectedIds(new Set())
    onClose()
  }, [selectedIds, workflowId, onClose])

  /**
   * Handle modal close - reset selection
   */
  const handleClose = useCallback(() => {
    setSelectedIds(new Set())
    onClose()
  }, [onClose])

  return (
    <Modal open={isOpen} onOpenChange={handleClose}>
      <ModalContent className="w-[400px]">
        <ModalHeader>Run "{workflowName}" in agents</ModalHeader>
        <ModalBody>
          <p className="text-[12px] text-[var(--text-secondary)] mb-4">
            Select the agents where you want to run this global workflow. Each agent will
            open in a new tab with the workflow ready to execute.
          </p>

          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {workspaces.map((ws) => (
              <label
                key={ws.id}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-[var(--surface-6)] cursor-pointer"
              >
                <Checkbox
                  checked={selectedIds.has(ws.id)}
                  onCheckedChange={(checked) => handleToggle(ws.id, checked === true)}
                />
                <span className="text-[14px] text-[var(--text-primary)]">{ws.name}</span>
              </label>
            ))}
          </div>

          {workspaces.length === 0 && (
            <p className="text-[12px] text-[var(--text-tertiary)] text-center py-4">
              No agents available
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <div className="flex items-center gap-2 mr-auto">
            <Button variant="ghost" size="sm" onClick={handleSelectAll}>
              Select All
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClearAll}>
              Clear
            </Button>
          </div>
          <Button variant="active" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleExecute} disabled={selectedIds.size === 0}>
            Run in {selectedIds.size} agent{selectedIds.size !== 1 ? 's' : ''}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
