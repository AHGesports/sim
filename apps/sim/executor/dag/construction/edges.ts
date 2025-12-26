import { createLogger } from '@sim/logger'
import { EDGE, isConditionBlockType, isRouterBlockType } from '@/executor/constants'
import type { DAG } from '@/executor/dag/builder'
import {
  buildBranchNodeId,
  buildSentinelEndId,
  buildSentinelStartId,
  calculateBranchCount,
  extractBaseBlockId,
  parseDistributionItems,
} from '@/executor/utils/subflow-utils'
import type { SerializedWorkflow } from '@/serializer/types'

const logger = createLogger('EdgeConstructor')

interface ConditionConfig {
  id: string
  label?: string
  condition: string
}

interface EdgeMetadata {
  blockTypeMap: Map<string, string>
  conditionConfigMap: Map<string, ConditionConfig[]>
  routerBlockIds: Set<string>
}

export class EdgeConstructor {
  execute(
    workflow: SerializedWorkflow,
    dag: DAG,
    blocksInParallels: Set<string>,
    blocksInLoops: Set<string>,
    reachableBlocks: Set<string>,
    pauseTriggerMapping: Map<string, string>
  ): void {
    const loopBlockIds = new Set(dag.loopConfigs.keys())
    const parallelBlockIds = new Set(dag.parallelConfigs.keys())
    const metadata = this.buildMetadataMaps(workflow)

    this.wireRegularEdges(
      workflow,
      dag,
      blocksInParallels,
      blocksInLoops,
      reachableBlocks,
      loopBlockIds,
      parallelBlockIds,
      metadata,
      pauseTriggerMapping
    )

    this.wireLoopSentinels(dag, reachableBlocks)
    this.wireParallelBlocks(workflow, dag, loopBlockIds, parallelBlockIds, pauseTriggerMapping)
  }

  private buildMetadataMaps(workflow: SerializedWorkflow): EdgeMetadata {
    const blockTypeMap = new Map<string, string>()
    const conditionConfigMap = new Map<string, ConditionConfig[]>()
    const routerBlockIds = new Set<string>()

    for (const block of workflow.blocks) {
      const blockType = block.metadata?.id ?? ''
      blockTypeMap.set(block.id, blockType)

      if (isConditionBlockType(blockType)) {
        const conditions = this.parseConditionConfig(block)

        if (conditions) {
          conditionConfigMap.set(block.id, conditions)
        }
      } else if (isRouterBlockType(blockType)) {
        routerBlockIds.add(block.id)
      }
    }

    return { blockTypeMap, conditionConfigMap, routerBlockIds }
  }

  private parseConditionConfig(block: any): ConditionConfig[] | null {
    try {
      const conditionsJson = block.config.params?.conditions

      if (typeof conditionsJson === 'string') {
        return JSON.parse(conditionsJson)
      }

      if (Array.isArray(conditionsJson)) {
        return conditionsJson
      }

      return null
    } catch (error) {
      logger.warn('Failed to parse condition config', {
        blockId: block.id,
        error: error instanceof Error ? error.message : String(error),
      })

      return null
    }
  }

  private generateSourceHandle(
    source: string,
    target: string,
    sourceHandle: string | undefined,
    metadata: EdgeMetadata,
    workflow: SerializedWorkflow
  ): string | undefined {
    let handle = sourceHandle

    if (!handle && isConditionBlockType(metadata.blockTypeMap.get(source) ?? '')) {
      const conditions = metadata.conditionConfigMap.get(source)

      if (conditions && conditions.length > 0) {
        const edgesFromCondition = workflow.connections.filter((c) => c.source === source)
        const edgeIndex = edgesFromCondition.findIndex((e) => e.target === target)

        if (edgeIndex >= 0 && edgeIndex < conditions.length) {
          const correspondingCondition = conditions[edgeIndex]
          handle = `${EDGE.CONDITION_PREFIX}${correspondingCondition.id}`
        }
      }
    }

    if (metadata.routerBlockIds.has(source) && handle !== EDGE.ERROR) {
      handle = `${EDGE.ROUTER_PREFIX}${target}`
    }

    return handle
  }

  private wireRegularEdges(
    workflow: SerializedWorkflow,
    dag: DAG,
    blocksInParallels: Set<string>,
    blocksInLoops: Set<string>,
    reachableBlocks: Set<string>,
    loopBlockIds: Set<string>,
    parallelBlockIds: Set<string>,
    metadata: EdgeMetadata,
    pauseTriggerMapping: Map<string, string>
  ): void {
    for (const connection of workflow.connections) {
      let { source, target } = connection
      const originalSource = source
      let sourceHandle = this.generateSourceHandle(
        source,
        target,
        connection.sourceHandle,
        metadata,
        workflow
      )
      const targetHandle = connection.targetHandle
      const sourceIsLoopBlock = loopBlockIds.has(source)
      const targetIsLoopBlock = loopBlockIds.has(target)
      const sourceIsParallelBlock = parallelBlockIds.has(source)
      const targetIsParallelBlock = parallelBlockIds.has(target)

      if (
        sourceIsLoopBlock ||
        targetIsLoopBlock ||
        sourceIsParallelBlock ||
        targetIsParallelBlock
      ) {
        let loopSentinelStartId: string | undefined

        if (sourceIsLoopBlock) {
          const sentinelEndId = buildSentinelEndId(originalSource)
          loopSentinelStartId = buildSentinelStartId(originalSource)

          if (!dag.nodes.has(sentinelEndId) || !dag.nodes.has(loopSentinelStartId)) {
            continue
          }

          source = sentinelEndId
          sourceHandle = EDGE.LOOP_EXIT
        }

        if (targetIsLoopBlock) {
          const sentinelStartId = buildSentinelStartId(target)

          if (!dag.nodes.has(sentinelStartId)) {
            continue
          }

          target = sentinelStartId
        }

        if (loopSentinelStartId) {
          this.addEdge(dag, loopSentinelStartId, target, EDGE.LOOP_EXIT, targetHandle)
        }

        if (sourceIsParallelBlock || targetIsParallelBlock) {
          continue
        }
      }

      if (this.edgeCrossesLoopBoundary(source, target, blocksInLoops, dag)) {
        continue
      }

      if (!this.isEdgeReachable(source, target, reachableBlocks, dag)) {
        continue
      }

      if (blocksInParallels.has(source) && blocksInParallels.has(target)) {
        const sourceParallelId = this.getParallelId(source, dag)
        const targetParallelId = this.getParallelId(target, dag)

        if (sourceParallelId === targetParallelId) {
          this.wireParallelInternalEdge(
            source,
            target,
            sourceParallelId!,
            dag,
            sourceHandle,
            targetHandle,
            pauseTriggerMapping
          )
        } else {
          logger.warn('Edge between different parallels - invalid workflow', { source, target })
        }
      } else if (blocksInParallels.has(source) || blocksInParallels.has(target)) {
      } else {
        const resolvedSource = pauseTriggerMapping.get(originalSource) ?? source
        this.addEdge(dag, resolvedSource, target, sourceHandle, targetHandle)
      }
    }
  }

  private wireLoopSentinels(dag: DAG, reachableBlocks: Set<string>): void {
    for (const [loopId, loopConfig] of dag.loopConfigs) {
      const nodes = loopConfig.nodes

      if (nodes.length === 0) continue

      const sentinelStartId = buildSentinelStartId(loopId)
      const sentinelEndId = buildSentinelEndId(loopId)

      if (!dag.nodes.has(sentinelStartId) || !dag.nodes.has(sentinelEndId)) {
        continue
      }

      const { startNodes, terminalNodes } = this.findLoopBoundaryNodes(nodes, dag, reachableBlocks)

      for (const startNodeId of startNodes) {
        this.addEdge(dag, sentinelStartId, startNodeId)
      }

      for (const terminalNodeId of terminalNodes) {
        this.addEdge(dag, terminalNodeId, sentinelEndId)
      }

      this.addEdge(dag, sentinelEndId, sentinelStartId, EDGE.LOOP_CONTINUE, undefined, true)
    }
  }

  private wireParallelBlocks(
    workflow: SerializedWorkflow,
    dag: DAG,
    loopBlockIds: Set<string>,
    parallelBlockIds: Set<string>,
    pauseTriggerMapping: Map<string, string>
  ): void {
    for (const [parallelId, parallelConfig] of dag.parallelConfigs) {
      const nodes = parallelConfig.nodes

      if (nodes.length === 0) continue

      const { entryNodes, terminalNodes, branchCount } = this.findParallelBoundaryNodes(
        nodes,
        parallelId,
        dag
      )

      logger.info('Wiring parallel block edges', {
        parallelId,
        entryNodes,
        terminalNodes,
        branchCount,
      })

      for (const connection of workflow.connections) {
        const { source, target, sourceHandle, targetHandle } = connection

        if (target === parallelId) {
          // Skip if source is another parallel (handled by wireParallelToParallelEdge from source's perspective)
          if (parallelBlockIds.has(source)) continue

          if (nodes.includes(source)) {
            logger.warn('Invalid: parallel block connected from its own internal node', {
              parallelId,
              source,
            })
            continue
          }

          // Handle loop → parallel connections
          if (loopBlockIds.has(source)) {
            this.wireLoopToParallelEdge(
              source,
              parallelId,
              entryNodes,
              branchCount,
              dag,
              sourceHandle,
              targetHandle
            )
            continue
          }

          logger.info('Wiring edge to parallel block', { source, parallelId, entryNodes })

          for (const entryNodeId of entryNodes) {
            for (let i = 0; i < branchCount; i++) {
              const branchNodeId = buildBranchNodeId(entryNodeId, i)

              if (dag.nodes.has(branchNodeId)) {
                this.addEdge(dag, source, branchNodeId, sourceHandle, targetHandle)
              }
            }
          }
        }

        if (source === parallelId) {
          if (nodes.includes(target)) {
            logger.warn('Invalid: parallel block connected to its own internal node', {
              parallelId,
              target,
            })
            continue
          }

          // Handle parallel-to-parallel connections
          if (parallelBlockIds.has(target)) {
            this.wireParallelToParallelEdge(
              parallelId,
              target,
              terminalNodes,
              branchCount,
              dag,
              sourceHandle,
              targetHandle,
              pauseTriggerMapping
            )
            continue
          }

          // Handle parallel → loop connections
          if (loopBlockIds.has(target)) {
            this.wireParallelToLoopEdge(
              parallelId,
              target,
              terminalNodes,
              branchCount,
              dag,
              sourceHandle,
              targetHandle,
              pauseTriggerMapping
            )
            continue
          }

          logger.info('Wiring edge from parallel block', { parallelId, target, terminalNodes })

          for (const terminalNodeId of terminalNodes) {
            for (let i = 0; i < branchCount; i++) {
              const branchNodeId = buildBranchNodeId(terminalNodeId, i)

              if (dag.nodes.has(branchNodeId)) {
                const resolvedSourceId = pauseTriggerMapping.get(branchNodeId) ?? branchNodeId
                this.addEdge(dag, resolvedSourceId, target, sourceHandle, targetHandle)
              }
            }
          }
        }
      }
    }
  }

  /**
   * Wires edges from one parallel block's terminal nodes to another parallel block's entry nodes.
   * This handles the case of consecutive parallel blocks (Parallel1 → Parallel2).
   */
  private wireParallelToParallelEdge(
    sourceParallelId: string,
    targetParallelId: string,
    sourceTerminalNodes: string[],
    sourceBranchCount: number,
    dag: DAG,
    sourceHandle?: string,
    targetHandle?: string,
    pauseTriggerMapping?: Map<string, string>
  ): void {
    const targetParallelConfig = dag.parallelConfigs.get(targetParallelId)

    if (!targetParallelConfig) {
      logger.warn('Target parallel config not found for parallel-to-parallel edge', {
        sourceParallelId,
        targetParallelId,
      })
      return
    }

    const targetNodes = targetParallelConfig.nodes

    if (targetNodes.length === 0) {
      logger.warn('Target parallel has no nodes', { targetParallelId })
      return
    }

    // Find entry nodes and branch count for the target parallel
    const { entryNodes: targetEntryNodes, branchCount: targetBranchCount } =
      this.findParallelBoundaryNodes(targetNodes, targetParallelId, dag)

    logger.info('Wiring parallel-to-parallel edge', {
      sourceParallelId,
      targetParallelId,
      sourceTerminalNodes,
      sourceBranchCount,
      targetEntryNodes,
      targetBranchCount,
    })

    // Wire from all terminal branches of source parallel to all entry branches of target parallel
    for (const sourceTerminalNodeId of sourceTerminalNodes) {
      for (let sourceBranchIdx = 0; sourceBranchIdx < sourceBranchCount; sourceBranchIdx++) {
        const sourceBranchNodeId = buildBranchNodeId(sourceTerminalNodeId, sourceBranchIdx)

        if (!dag.nodes.has(sourceBranchNodeId)) continue

        const resolvedSourceId = pauseTriggerMapping?.get(sourceBranchNodeId) ?? sourceBranchNodeId

        for (const targetEntryNodeId of targetEntryNodes) {
          for (let targetBranchIdx = 0; targetBranchIdx < targetBranchCount; targetBranchIdx++) {
            const targetBranchNodeId = buildBranchNodeId(targetEntryNodeId, targetBranchIdx)

            if (dag.nodes.has(targetBranchNodeId)) {
              this.addEdge(dag, resolvedSourceId, targetBranchNodeId, sourceHandle, targetHandle)
            }
          }
        }
      }
    }
  }

  /**
   * Wires edges from a loop block's sentinel end to a parallel block's entry nodes.
   * This handles the case of Loop → Parallel connections.
   */
  private wireLoopToParallelEdge(
    sourceLoopId: string,
    targetParallelId: string,
    targetEntryNodes: string[],
    targetBranchCount: number,
    dag: DAG,
    sourceHandle?: string,
    targetHandle?: string
  ): void {
    const sentinelEndId = buildSentinelEndId(sourceLoopId)

    if (!dag.nodes.has(sentinelEndId)) {
      logger.warn('Loop sentinel end not found for loop-to-parallel edge', {
        sourceLoopId,
        targetParallelId,
        sentinelEndId,
      })
      return
    }

    logger.info('Wiring loop-to-parallel edge', {
      sourceLoopId,
      targetParallelId,
      sentinelEndId,
      targetEntryNodes,
      targetBranchCount,
    })

    // Wire from loop's sentinel end to all entry branches of the parallel
    for (const targetEntryNodeId of targetEntryNodes) {
      for (let branchIdx = 0; branchIdx < targetBranchCount; branchIdx++) {
        const targetBranchNodeId = buildBranchNodeId(targetEntryNodeId, branchIdx)

        if (dag.nodes.has(targetBranchNodeId)) {
          this.addEdge(dag, sentinelEndId, targetBranchNodeId, sourceHandle, targetHandle)
        }
      }
    }
  }

  /**
   * Wires edges from a parallel block's terminal nodes to a loop block's sentinel start.
   * This handles the case of Parallel → Loop connections.
   */
  private wireParallelToLoopEdge(
    sourceParallelId: string,
    targetLoopId: string,
    sourceTerminalNodes: string[],
    sourceBranchCount: number,
    dag: DAG,
    sourceHandle?: string,
    targetHandle?: string,
    pauseTriggerMapping?: Map<string, string>
  ): void {
    const sentinelStartId = buildSentinelStartId(targetLoopId)

    if (!dag.nodes.has(sentinelStartId)) {
      logger.warn('Loop sentinel start not found for parallel-to-loop edge', {
        sourceParallelId,
        targetLoopId,
        sentinelStartId,
      })
      return
    }

    logger.info('Wiring parallel-to-loop edge', {
      sourceParallelId,
      targetLoopId,
      sourceTerminalNodes,
      sourceBranchCount,
      sentinelStartId,
    })

    // Wire from all terminal branches of the parallel to the loop's sentinel start
    for (const sourceTerminalNodeId of sourceTerminalNodes) {
      for (let branchIdx = 0; branchIdx < sourceBranchCount; branchIdx++) {
        const sourceBranchNodeId = buildBranchNodeId(sourceTerminalNodeId, branchIdx)

        if (!dag.nodes.has(sourceBranchNodeId)) continue

        const resolvedSourceId = pauseTriggerMapping?.get(sourceBranchNodeId) ?? sourceBranchNodeId
        this.addEdge(dag, resolvedSourceId, sentinelStartId, sourceHandle, targetHandle)
      }
    }
  }

  private edgeCrossesLoopBoundary(
    source: string,
    target: string,
    blocksInLoops: Set<string>,
    dag: DAG
  ): boolean {
    const sourceInLoop = blocksInLoops.has(source)
    const targetInLoop = blocksInLoops.has(target)

    if (sourceInLoop !== targetInLoop) {
      return true
    }

    if (!sourceInLoop && !targetInLoop) {
      return false
    }

    let sourceLoopId: string | undefined
    let targetLoopId: string | undefined

    for (const [loopId, loopConfig] of dag.loopConfigs) {
      if (loopConfig.nodes.includes(source)) {
        sourceLoopId = loopId
      }

      if (loopConfig.nodes.includes(target)) {
        targetLoopId = loopId
      }
    }

    return sourceLoopId !== targetLoopId
  }

  private isEdgeReachable(
    source: string,
    target: string,
    reachableBlocks: Set<string>,
    dag: DAG
  ): boolean {
    if (!reachableBlocks.has(source) && !dag.nodes.has(source)) {
      return false
    }
    if (!reachableBlocks.has(target) && !dag.nodes.has(target)) {
      return false
    }
    return true
  }

  private wireParallelInternalEdge(
    source: string,
    target: string,
    parallelId: string,
    dag: DAG,
    sourceHandle?: string,
    targetHandle?: string,
    pauseTriggerMapping?: Map<string, string>
  ): void {
    const parallelConfig = dag.parallelConfigs.get(parallelId)

    if (!parallelConfig) {
      throw new Error(`Parallel config not found: ${parallelId}`)
    }

    const distributionItems = parseDistributionItems(parallelConfig)
    const count = calculateBranchCount(parallelConfig, distributionItems)

    for (let i = 0; i < count; i++) {
      const sourceNodeId = buildBranchNodeId(source, i)
      const targetNodeId = buildBranchNodeId(target, i)
      const resolvedSourceId = pauseTriggerMapping?.get(sourceNodeId) ?? sourceNodeId
      this.addEdge(dag, resolvedSourceId, targetNodeId, sourceHandle, targetHandle)
    }
  }

  private findLoopBoundaryNodes(
    nodes: string[],
    dag: DAG,
    reachableBlocks: Set<string>
  ): { startNodes: string[]; terminalNodes: string[] } {
    const nodesSet = new Set(nodes)
    const startNodesSet = new Set<string>()
    const terminalNodesSet = new Set<string>()

    for (const nodeId of nodes) {
      const node = dag.nodes.get(nodeId)

      if (!node) continue

      let hasIncomingFromLoop = false

      for (const incomingNodeId of node.incomingEdges) {
        if (nodesSet.has(incomingNodeId)) {
          hasIncomingFromLoop = true
          break
        }
      }

      if (!hasIncomingFromLoop) {
        startNodesSet.add(nodeId)
      }
    }

    for (const nodeId of nodes) {
      const node = dag.nodes.get(nodeId)

      if (!node) continue

      let hasOutgoingToLoop = false

      for (const [_, edge] of node.outgoingEdges) {
        if (nodesSet.has(edge.target)) {
          hasOutgoingToLoop = true
          break
        }
      }

      if (!hasOutgoingToLoop) {
        terminalNodesSet.add(nodeId)
      }
    }

    return {
      startNodes: Array.from(startNodesSet),
      terminalNodes: Array.from(terminalNodesSet),
    }
  }

  private findParallelBoundaryNodes(
    nodes: string[],
    parallelId: string,
    dag: DAG
  ): { entryNodes: string[]; terminalNodes: string[]; branchCount: number } {
    const nodesSet = new Set(nodes)
    const entryNodesSet = new Set<string>()
    const terminalNodesSet = new Set<string>()
    const parallelConfig = dag.parallelConfigs.get(parallelId)

    if (!parallelConfig) {
      throw new Error(`Parallel config not found: ${parallelId}`)
    }

    const distributionItems = parseDistributionItems(parallelConfig)
    const branchCount = calculateBranchCount(parallelConfig, distributionItems)

    for (const nodeId of nodes) {
      let hasAnyBranch = false

      for (let i = 0; i < branchCount; i++) {
        if (dag.nodes.has(buildBranchNodeId(nodeId, i))) {
          hasAnyBranch = true
          break
        }
      }

      if (!hasAnyBranch) continue

      const firstBranchId = buildBranchNodeId(nodeId, 0)
      const firstBranchNode = dag.nodes.get(firstBranchId)

      if (!firstBranchNode) continue

      let hasIncomingFromParallel = false

      for (const incomingNodeId of firstBranchNode.incomingEdges) {
        const originalNodeId = extractBaseBlockId(incomingNodeId)

        if (nodesSet.has(originalNodeId)) {
          hasIncomingFromParallel = true
          break
        }
      }

      if (!hasIncomingFromParallel) {
        entryNodesSet.add(nodeId)
      }
    }

    for (const nodeId of nodes) {
      let hasAnyBranch = false

      for (let i = 0; i < branchCount; i++) {
        if (dag.nodes.has(buildBranchNodeId(nodeId, i))) {
          hasAnyBranch = true
          break
        }
      }

      if (!hasAnyBranch) continue

      const firstBranchId = buildBranchNodeId(nodeId, 0)
      const firstBranchNode = dag.nodes.get(firstBranchId)

      if (!firstBranchNode) continue

      let hasOutgoingToParallel = false

      for (const [_, edge] of firstBranchNode.outgoingEdges) {
        const originalTargetId = extractBaseBlockId(edge.target)

        if (nodesSet.has(originalTargetId)) {
          hasOutgoingToParallel = true
          break
        }
      }

      if (!hasOutgoingToParallel) {
        terminalNodesSet.add(nodeId)
      }
    }

    return {
      entryNodes: Array.from(entryNodesSet),
      terminalNodes: Array.from(terminalNodesSet),
      branchCount,
    }
  }

  private getParallelId(blockId: string, dag: DAG): string | null {
    for (const [parallelId, parallelConfig] of dag.parallelConfigs) {
      if (parallelConfig.nodes.includes(blockId)) {
        return parallelId
      }
    }
    return null
  }

  private addEdge(
    dag: DAG,
    sourceId: string,
    targetId: string,
    sourceHandle?: string,
    targetHandle?: string,
    isLoopBackEdge = false
  ): void {
    const sourceNode = dag.nodes.get(sourceId)
    const targetNode = dag.nodes.get(targetId)

    if (!sourceNode || !targetNode) {
      logger.warn('Edge references non-existent node', { sourceId, targetId })
      return
    }

    const edgeId = `${sourceId}→${targetId}${sourceHandle ? `-${sourceHandle}` : ''}`

    sourceNode.outgoingEdges.set(edgeId, {
      target: targetId,
      sourceHandle,
      targetHandle,
      isActive: isLoopBackEdge ? false : undefined,
    })

    if (!isLoopBackEdge) {
      targetNode.incomingEdges.add(sourceId)
    }
  }
}
