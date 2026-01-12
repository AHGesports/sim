/**
 * React Query hooks for system MCP tools and servers.
 *
 * System MCP tools are postgres-agent and postgres-global servers
 * that use cached schemas - NO database connection required.
 */

import { createLogger } from '@sim/logger'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { McpTool, SystemMcpServer } from '@/lib/mcp/types'

const logger = createLogger('SystemMcpQueries')

interface SystemMcpData {
  tools: McpTool[]
  servers: SystemMcpServer[]
}

interface ToolConfigRecord {
  serverId: string
  toolName: string
  enabled: boolean
}

export const systemMcpKeys = {
  all: ['system-mcp'] as const,
  data: (workspaceId: string) => [...systemMcpKeys.all, 'data', workspaceId] as const,
  config: (workspaceId: string) => [...systemMcpKeys.all, 'config', workspaceId] as const,
}

/**
 * Fetch system MCP data (tools and servers) from API.
 */
async function fetchSystemMcpData(workspaceId: string): Promise<SystemMcpData> {
  const response = await fetch(`/api/mcp/system-tools?workspaceId=${workspaceId}`)

  if (response.status === 404) {
    return { tools: [], servers: [] }
  }

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch system MCP data')
  }

  return {
    tools: data.data?.tools || [],
    servers: data.data?.servers || [],
  }
}

/**
 * Fetch tool configuration for a workspace.
 */
async function fetchToolConfig(workspaceId: string): Promise<ToolConfigRecord[]> {
  const response = await fetch(`/api/mcp/system-tools/config?workspaceId=${workspaceId}`)

  if (response.status === 404) {
    return []
  }

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch tool config')
  }

  return data.data?.config || []
}

/**
 * Hook to fetch system MCP tools for a workspace.
 * Uses cached schemas - NO database connection required.
 */
export function useSystemMcpTools(workspaceId: string) {
  const query = useQuery({
    queryKey: systemMcpKeys.data(workspaceId),
    queryFn: () => fetchSystemMcpData(workspaceId),
    enabled: !!workspaceId,
    retry: false,
    staleTime: 60 * 1000, // 1 minute - schemas rarely change
    placeholderData: keepPreviousData,
  })

  return {
    ...query,
    data: query.data?.tools || [],
  }
}

/**
 * Hook to fetch system MCP servers for a workspace.
 * Returns virtual server configs (Agent Database, Global Database).
 */
export function useSystemMcpServers(workspaceId: string) {
  const query = useQuery({
    queryKey: systemMcpKeys.data(workspaceId),
    queryFn: () => fetchSystemMcpData(workspaceId),
    enabled: !!workspaceId,
    retry: false,
    staleTime: 60 * 1000, // 1 minute - schemas rarely change
    placeholderData: keepPreviousData,
  })

  return {
    ...query,
    data: query.data?.servers || [],
  }
}

/**
 * Hook to fetch tool configuration for a workspace.
 * Returns which tools are enabled/disabled.
 */
export function useSystemMcpToolConfig(workspaceId: string) {
  return useQuery({
    queryKey: systemMcpKeys.config(workspaceId),
    queryFn: () => fetchToolConfig(workspaceId),
    enabled: !!workspaceId,
    retry: false,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

interface UpdateToolConfigParams {
  workspaceId: string
  serverId: string
  tools: Array<{ toolName: string; enabled: boolean }>
}

/**
 * Hook to update tool configuration.
 */
export function useUpdateSystemMcpToolConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ workspaceId, serverId, tools }: UpdateToolConfigParams) => {
      const response = await fetch('/api/mcp/system-tools/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, serverId, tools }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update tool config')
      }

      return data
    },
    onSuccess: (_data, variables) => {
      // Invalidate both config and server data to refresh UI
      queryClient.invalidateQueries({ queryKey: systemMcpKeys.config(variables.workspaceId) })
      queryClient.invalidateQueries({ queryKey: systemMcpKeys.data(variables.workspaceId) })
    },
  })
}
