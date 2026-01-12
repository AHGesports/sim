import { Badge, Button } from '@/components/emcn'
import { McpIcon } from '@/components/icons'
import { SYSTEM_MCP_SERVER_IDS } from '@/lib/mcp/types'

export function formatTransportLabel(transport: string): string {
  return transport
    .split('-')
    .map((word) =>
      ['http', 'sse', 'stdio'].includes(word.toLowerCase())
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join('-')
}

function formatToolsLabel(tools: any[], connectionStatus?: string): string {
  if (connectionStatus === 'error') {
    return 'Unable to connect'
  }
  const count = tools.length
  const plural = count !== 1 ? 's' : ''
  const names = count > 0 ? `: ${tools.map((t) => t.name).join(', ')}` : ''
  return `${count} tool${plural}${names}`
}

interface ServerListItemProps {
  server: any
  tools: any[]
  isDeleting: boolean
  isLoadingTools?: boolean
  isRefreshing?: boolean
  isSystemManaged?: boolean
  onRemove: () => void
  onViewDetails: () => void
}

export function ServerListItem({
  server,
  tools,
  isDeleting,
  isLoadingTools = false,
  isRefreshing = false,
  isSystemManaged = false,
  onRemove,
  onViewDetails,
}: ServerListItemProps) {
  const transportLabel = formatTransportLabel(server.transport || 'http')
  const toolsLabel = formatToolsLabel(tools, server.connectionStatus)
  const isError = server.connectionStatus === 'error'

  // Get icon color for system servers
  const getSystemServerIconColor = () => {
    if (!isSystemManaged) return undefined
    if (server.id === SYSTEM_MCP_SERVER_IDS.POSTGRES_AGENT) return 'var(--brand-primary-hex)'
    if (server.id === SYSTEM_MCP_SERVER_IDS.POSTGRES_GLOBAL) return '#3B82F6'
    return '#6366F1' // Default purple for other system servers
  }

  return (
    <div className='flex items-center justify-between gap-[12px]'>
      <div className='flex min-w-0 flex-col justify-center gap-[1px]'>
        <div className='flex items-center gap-[6px]'>
          {isSystemManaged && (
            <div
              className='flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-[5px]'
              style={{ backgroundColor: getSystemServerIconColor() }}
            >
              <McpIcon className='h-[14px] w-[14px] text-white' />
            </div>
          )}
          <span className='max-w-[200px] truncate font-medium text-[14px]'>
            {server.name || 'Unnamed Server'}
          </span>
          {isSystemManaged ? (
            <Badge variant='gray-secondary' size='sm'>
              System
            </Badge>
          ) : (
            <span className='text-[13px] text-[var(--text-secondary)]'>({transportLabel})</span>
          )}
        </div>
        <p
          className={`truncate text-[13px] ${isError ? 'text-red-500 dark:text-red-400' : 'text-[var(--text-muted)]'}`}
        >
          {isRefreshing
            ? 'Refreshing...'
            : isLoadingTools && tools.length === 0
              ? 'Loading...'
              : toolsLabel}
        </p>
      </div>
      <div className='flex flex-shrink-0 items-center gap-[4px]'>
        <Button variant='ghost' onClick={onViewDetails}>
          {isSystemManaged ? 'Configure' : 'Details'}
        </Button>
        {!isSystemManaged && (
          <Button variant='destructive' onClick={onRemove} disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        )}
      </div>
    </div>
  )
}
