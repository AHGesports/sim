import { loggerMock } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DAG, DAGNode } from '@/executor/dag/builder'
import {
  buildBranchNodeId,
  buildSentinelEndId,
  buildSentinelStartId,
} from '@/executor/utils/subflow-utils'
import type { SerializedBlock, SerializedLoop, SerializedWorkflow } from '@/serializer/types'
import { EdgeConstructor } from './edges'

vi.mock('@sim/logger', () => loggerMock)

function createMockBlock(id: string, type = 'function', config: any = {}): SerializedBlock {
  return {
    id,
    metadata: { id: type, name: `Block ${id}` },
    position: { x: 0, y: 0 },
    config: { tool: type, params: config },
    inputs: {},
    outputs: {},
    enabled: true,
  }
}

function createMockNode(id: string): DAGNode {
  return {
    id,
    block: createMockBlock(id),
    outgoingEdges: new Map(),
    incomingEdges: new Set(),
    metadata: {},
  }
}

function createMockDAG(nodeIds: string[]): DAG {
  const nodes = new Map<string, DAGNode>()
  for (const id of nodeIds) {
    nodes.set(id, createMockNode(id))
  }
  return {
    nodes,
    loopConfigs: new Map(),
    parallelConfigs: new Map(),
  }
}

function createMockWorkflow(
  blocks: SerializedBlock[],
  connections: Array<{
    source: string
    target: string
    sourceHandle?: string
    targetHandle?: string
  }>,
  loops: Record<string, SerializedLoop> = {},
  parallels: Record<string, any> = {}
): SerializedWorkflow {
  return {
    version: '1',
    blocks,
    connections,
    loops,
    parallels,
  }
}

describe('EdgeConstructor', () => {
  let edgeConstructor: EdgeConstructor

  beforeEach(() => {
    edgeConstructor = new EdgeConstructor()
  })

  describe('Edge ID generation (bug fix verification)', () => {
    it('should generate unique edge IDs for multiple edges to same target with different handles', () => {
      const conditionId = 'condition-1'
      const targetId = 'target-1'

      const conditionBlock = createMockBlock(conditionId, 'condition', {
        conditions: JSON.stringify([
          { id: 'if-id', label: 'if', condition: 'true' },
          { id: 'else-id', label: 'else', condition: '' },
        ]),
      })

      const workflow = createMockWorkflow(
        [conditionBlock, createMockBlock(targetId)],
        [
          { source: conditionId, target: targetId, sourceHandle: 'condition-if-id' },
          { source: conditionId, target: targetId, sourceHandle: 'condition-else-id' },
        ]
      )

      const dag = createMockDAG([conditionId, targetId])

      edgeConstructor.execute(
        workflow,
        dag,
        new Set(),
        new Set(),
        new Set([conditionId, targetId]),
        new Map()
      )

      const conditionNode = dag.nodes.get(conditionId)!

      // Should have 2 edges, not 1 (the bug was that they would overwrite each other)
      expect(conditionNode.outgoingEdges.size).toBe(2)

      // Verify edge IDs are unique and include the sourceHandle
      const edgeIds = Array.from(conditionNode.outgoingEdges.keys())
      expect(edgeIds).toContain(`${conditionId}→${targetId}-condition-if-id`)
      expect(edgeIds).toContain(`${conditionId}→${targetId}-condition-else-id`)
    })

    it('should generate edge ID without handle suffix when no sourceHandle', () => {
      const sourceId = 'source-1'
      const targetId = 'target-1'

      const workflow = createMockWorkflow(
        [createMockBlock(sourceId), createMockBlock(targetId)],
        [{ source: sourceId, target: targetId }]
      )

      const dag = createMockDAG([sourceId, targetId])

      edgeConstructor.execute(
        workflow,
        dag,
        new Set(),
        new Set(),
        new Set([sourceId, targetId]),
        new Map()
      )

      const sourceNode = dag.nodes.get(sourceId)!
      const edgeIds = Array.from(sourceNode.outgoingEdges.keys())

      expect(edgeIds).toContain(`${sourceId}→${targetId}`)
    })
  })

  describe('Condition block edge wiring', () => {
    it('should wire condition block edges with proper condition prefixes', () => {
      const conditionId = 'condition-1'
      const target1Id = 'target-1'
      const target2Id = 'target-2'

      const conditionBlock = createMockBlock(conditionId, 'condition', {
        conditions: JSON.stringify([
          { id: 'cond-if', label: 'if', condition: 'x > 5' },
          { id: 'cond-else', label: 'else', condition: '' },
        ]),
      })

      const workflow = createMockWorkflow(
        [conditionBlock, createMockBlock(target1Id), createMockBlock(target2Id)],
        [
          { source: conditionId, target: target1Id, sourceHandle: 'condition-cond-if' },
          { source: conditionId, target: target2Id, sourceHandle: 'condition-cond-else' },
        ]
      )

      const dag = createMockDAG([conditionId, target1Id, target2Id])

      edgeConstructor.execute(
        workflow,
        dag,
        new Set(),
        new Set(),
        new Set([conditionId, target1Id, target2Id]),
        new Map()
      )

      const conditionNode = dag.nodes.get(conditionId)!

      expect(conditionNode.outgoingEdges.size).toBe(2)

      // Verify edges have correct targets and handles
      const edges = Array.from(conditionNode.outgoingEdges.values())
      const ifEdge = edges.find((e) => e.sourceHandle === 'condition-cond-if')
      const elseEdge = edges.find((e) => e.sourceHandle === 'condition-cond-else')

      expect(ifEdge?.target).toBe(target1Id)
      expect(elseEdge?.target).toBe(target2Id)
    })

    it('should handle condition block with if→A, elseif→B, else→A pattern', () => {
      const conditionId = 'condition-1'
      const targetAId = 'target-a'
      const targetBId = 'target-b'

      const conditionBlock = createMockBlock(conditionId, 'condition', {
        conditions: JSON.stringify([
          { id: 'if-id', label: 'if', condition: 'x == 1' },
          { id: 'elseif-id', label: 'else if', condition: 'x == 2' },
          { id: 'else-id', label: 'else', condition: '' },
        ]),
      })

      const workflow = createMockWorkflow(
        [conditionBlock, createMockBlock(targetAId), createMockBlock(targetBId)],
        [
          { source: conditionId, target: targetAId, sourceHandle: 'condition-if-id' },
          { source: conditionId, target: targetBId, sourceHandle: 'condition-elseif-id' },
          { source: conditionId, target: targetAId, sourceHandle: 'condition-else-id' },
        ]
      )

      const dag = createMockDAG([conditionId, targetAId, targetBId])

      edgeConstructor.execute(
        workflow,
        dag,
        new Set(),
        new Set(),
        new Set([conditionId, targetAId, targetBId]),
        new Map()
      )

      const conditionNode = dag.nodes.get(conditionId)!

      // Should have 3 edges (if→A, elseif→B, else→A)
      expect(conditionNode.outgoingEdges.size).toBe(3)

      // Target A should have 2 incoming edges (from if and else)
      const targetANode = dag.nodes.get(targetAId)!
      expect(targetANode.incomingEdges.has(conditionId)).toBe(true)

      // Target B should have 1 incoming edge (from elseif)
      const targetBNode = dag.nodes.get(targetBId)!
      expect(targetBNode.incomingEdges.has(conditionId)).toBe(true)
    })
  })

  describe('Router block edge wiring', () => {
    it('should wire router block edges with router prefix', () => {
      const routerId = 'router-1'
      const target1Id = 'target-1'
      const target2Id = 'target-2'

      const routerBlock = createMockBlock(routerId, 'router')

      const workflow = createMockWorkflow(
        [routerBlock, createMockBlock(target1Id), createMockBlock(target2Id)],
        [
          { source: routerId, target: target1Id },
          { source: routerId, target: target2Id },
        ]
      )

      const dag = createMockDAG([routerId, target1Id, target2Id])

      edgeConstructor.execute(
        workflow,
        dag,
        new Set(),
        new Set(),
        new Set([routerId, target1Id, target2Id]),
        new Map()
      )

      const routerNode = dag.nodes.get(routerId)!
      const edges = Array.from(routerNode.outgoingEdges.values())

      // Router edges should have router- prefix with target ID
      expect(edges[0].sourceHandle).toBe(`router-${target1Id}`)
      expect(edges[1].sourceHandle).toBe(`router-${target2Id}`)
    })
  })

  describe('Simple linear workflow', () => {
    it('should wire linear workflow correctly', () => {
      const block1Id = 'block-1'
      const block2Id = 'block-2'
      const block3Id = 'block-3'

      const workflow = createMockWorkflow(
        [createMockBlock(block1Id), createMockBlock(block2Id), createMockBlock(block3Id)],
        [
          { source: block1Id, target: block2Id },
          { source: block2Id, target: block3Id },
        ]
      )

      const dag = createMockDAG([block1Id, block2Id, block3Id])

      edgeConstructor.execute(
        workflow,
        dag,
        new Set(),
        new Set(),
        new Set([block1Id, block2Id, block3Id]),
        new Map()
      )

      // Block 1 → Block 2
      const block1Node = dag.nodes.get(block1Id)!
      expect(block1Node.outgoingEdges.size).toBe(1)
      expect(Array.from(block1Node.outgoingEdges.values())[0].target).toBe(block2Id)

      // Block 2 → Block 3
      const block2Node = dag.nodes.get(block2Id)!
      expect(block2Node.outgoingEdges.size).toBe(1)
      expect(Array.from(block2Node.outgoingEdges.values())[0].target).toBe(block3Id)
      expect(block2Node.incomingEdges.has(block1Id)).toBe(true)

      // Block 3 has incoming from Block 2
      const block3Node = dag.nodes.get(block3Id)!
      expect(block3Node.incomingEdges.has(block2Id)).toBe(true)
    })
  })

  describe('Edge reachability', () => {
    it('should not wire edges to blocks not in DAG nodes', () => {
      const block1Id = 'block-1'
      const block2Id = 'block-2'
      const unreachableId = 'unreachable'

      const workflow = createMockWorkflow(
        [createMockBlock(block1Id), createMockBlock(block2Id), createMockBlock(unreachableId)],
        [
          { source: block1Id, target: block2Id },
          { source: block1Id, target: unreachableId },
        ]
      )

      // Only create DAG nodes for block1 and block2 (not unreachable)
      const dag = createMockDAG([block1Id, block2Id])

      edgeConstructor.execute(
        workflow,
        dag,
        new Set(),
        new Set(),
        new Set([block1Id, block2Id]),
        new Map()
      )

      const block1Node = dag.nodes.get(block1Id)!

      // Should only have edge to block2, not unreachable (not in DAG)
      expect(block1Node.outgoingEdges.size).toBe(1)
      expect(Array.from(block1Node.outgoingEdges.values())[0].target).toBe(block2Id)
    })

    it('should check both reachableBlocks and dag.nodes for edge validity', () => {
      const block1Id = 'block-1'
      const block2Id = 'block-2'

      const workflow = createMockWorkflow(
        [createMockBlock(block1Id), createMockBlock(block2Id)],
        [{ source: block1Id, target: block2Id }]
      )

      const dag = createMockDAG([block1Id, block2Id])

      // Block2 exists in DAG but not in reachableBlocks - edge should still be wired
      // because isEdgeReachable checks: reachableBlocks.has(target) || dag.nodes.has(target)
      edgeConstructor.execute(
        workflow,
        dag,
        new Set(),
        new Set(),
        new Set([block1Id]), // Only block1 is "reachable" but block2 exists in DAG
        new Map()
      )

      const block1Node = dag.nodes.get(block1Id)!
      expect(block1Node.outgoingEdges.size).toBe(1)
    })
  })

  describe('Error edge handling', () => {
    it('should preserve error sourceHandle', () => {
      const sourceId = 'source-1'
      const successTargetId = 'success-target'
      const errorTargetId = 'error-target'

      const workflow = createMockWorkflow(
        [
          createMockBlock(sourceId),
          createMockBlock(successTargetId),
          createMockBlock(errorTargetId),
        ],
        [
          { source: sourceId, target: successTargetId, sourceHandle: 'source' },
          { source: sourceId, target: errorTargetId, sourceHandle: 'error' },
        ]
      )

      const dag = createMockDAG([sourceId, successTargetId, errorTargetId])

      edgeConstructor.execute(
        workflow,
        dag,
        new Set(),
        new Set(),
        new Set([sourceId, successTargetId, errorTargetId]),
        new Map()
      )

      const sourceNode = dag.nodes.get(sourceId)!
      const edges = Array.from(sourceNode.outgoingEdges.values())

      const successEdge = edges.find((e) => e.target === successTargetId)
      const errorEdge = edges.find((e) => e.target === errorTargetId)

      expect(successEdge?.sourceHandle).toBe('source')
      expect(errorEdge?.sourceHandle).toBe('error')
    })
  })

  describe('Loop sentinel wiring', () => {
    it('should wire loop sentinels to nodes with no incoming edges from within loop', () => {
      const loopId = 'loop-1'
      const nodeInLoopId = 'node-in-loop'
      const sentinelStartId = `loop-${loopId}-sentinel-start`
      const sentinelEndId = `loop-${loopId}-sentinel-end`

      // Create DAG with sentinels - nodeInLoop has no incoming edges from loop nodes
      // so it will be identified as a start node
      const dag = createMockDAG([nodeInLoopId, sentinelStartId, sentinelEndId])
      dag.loopConfigs.set(loopId, {
        id: loopId,
        nodes: [nodeInLoopId],
        iterations: 5,
        loopType: 'for',
      } as SerializedLoop)

      const workflow = createMockWorkflow([createMockBlock(nodeInLoopId)], [], {
        [loopId]: {
          id: loopId,
          nodes: [nodeInLoopId],
          iterations: 5,
          loopType: 'for',
        } as SerializedLoop,
      })

      edgeConstructor.execute(
        workflow,
        dag,
        new Set(),
        new Set([nodeInLoopId]),
        new Set([nodeInLoopId, sentinelStartId, sentinelEndId]),
        new Map()
      )

      // Sentinel start should have edge to node in loop (it's a start node - no incoming from loop)
      const sentinelStartNode = dag.nodes.get(sentinelStartId)!
      expect(sentinelStartNode.outgoingEdges.size).toBe(1)
      const startEdge = Array.from(sentinelStartNode.outgoingEdges.values())[0]
      expect(startEdge.target).toBe(nodeInLoopId)

      // Node in loop should have edge to sentinel end (it's a terminal node - no outgoing to loop)
      const nodeInLoopNode = dag.nodes.get(nodeInLoopId)!
      const hasEdgeToEnd = Array.from(nodeInLoopNode.outgoingEdges.values()).some(
        (e) => e.target === sentinelEndId
      )
      expect(hasEdgeToEnd).toBe(true)

      // Sentinel end should have loop_continue edge back to start
      const sentinelEndNode = dag.nodes.get(sentinelEndId)!
      const continueEdge = Array.from(sentinelEndNode.outgoingEdges.values()).find(
        (e) => e.sourceHandle === 'loop_continue'
      )
      expect(continueEdge?.target).toBe(sentinelStartId)
    })

    it('should identify multiple start and terminal nodes in loop', () => {
      const loopId = 'loop-1'
      const node1Id = 'node-1'
      const node2Id = 'node-2'
      const sentinelStartId = `loop-${loopId}-sentinel-start`
      const sentinelEndId = `loop-${loopId}-sentinel-end`

      // Create DAG with two nodes in loop - both are start and terminal (no edges between them)
      const dag = createMockDAG([node1Id, node2Id, sentinelStartId, sentinelEndId])
      dag.loopConfigs.set(loopId, {
        id: loopId,
        nodes: [node1Id, node2Id],
        iterations: 3,
        loopType: 'for',
      } as SerializedLoop)

      const workflow = createMockWorkflow(
        [createMockBlock(node1Id), createMockBlock(node2Id)],
        [],
        {
          [loopId]: {
            id: loopId,
            nodes: [node1Id, node2Id],
            iterations: 3,
            loopType: 'for',
          } as SerializedLoop,
        }
      )

      edgeConstructor.execute(
        workflow,
        dag,
        new Set(),
        new Set([node1Id, node2Id]),
        new Set([node1Id, node2Id, sentinelStartId, sentinelEndId]),
        new Map()
      )

      // Sentinel start should have edges to both nodes (both are start nodes)
      const sentinelStartNode = dag.nodes.get(sentinelStartId)!
      expect(sentinelStartNode.outgoingEdges.size).toBe(2)

      // Both nodes should have edges to sentinel end (both are terminal nodes)
      const node1 = dag.nodes.get(node1Id)!
      const node2 = dag.nodes.get(node2Id)!
      expect(Array.from(node1.outgoingEdges.values()).some((e) => e.target === sentinelEndId)).toBe(
        true
      )
      expect(Array.from(node2.outgoingEdges.values()).some((e) => e.target === sentinelEndId)).toBe(
        true
      )
    })
  })

  describe('Consecutive parallel blocks', () => {
    it('should wire edges from one parallel block to another parallel block', () => {
      // This tests the bug where Parallel1 → Parallel2 edges were not being wired
      // because both wireParallelBlocks checks would skip parallel-to-parallel connections
      const parallel1Id = 'parallel-1'
      const parallel2Id = 'parallel-2'
      const nodeInParallel1 = 'node-in-p1'
      const nodeInParallel2 = 'node-in-p2'

      // Create branch nodes for each parallel using correct subscript notation
      const branch0NodeP1 = buildBranchNodeId(nodeInParallel1, 0)
      const branch0NodeP2 = buildBranchNodeId(nodeInParallel2, 0)

      const dag = createMockDAG([branch0NodeP1, branch0NodeP2])

      // Set up parallel configs
      dag.parallelConfigs.set(parallel1Id, {
        id: parallel1Id,
        nodes: [nodeInParallel1],
        parallelType: 'count',
        count: 1,
      } as any)

      dag.parallelConfigs.set(parallel2Id, {
        id: parallel2Id,
        nodes: [nodeInParallel2],
        parallelType: 'count',
        count: 1,
      } as any)

      // Update node metadata for branch nodes
      const p1Node = dag.nodes.get(branch0NodeP1)!
      p1Node.metadata = {
        isParallelBranch: true,
        branchIndex: 0,
        branchTotal: 1,
        parallelId: parallel1Id,
        originalBlockId: nodeInParallel1,
      }

      const p2Node = dag.nodes.get(branch0NodeP2)!
      p2Node.metadata = {
        isParallelBranch: true,
        branchIndex: 0,
        branchTotal: 1,
        parallelId: parallel2Id,
        originalBlockId: nodeInParallel2,
      }

      const workflow = createMockWorkflow(
        [createMockBlock(nodeInParallel1), createMockBlock(nodeInParallel2)],
        [
          // Connection from parallel1 (via parallel-end-source) to parallel2
          { source: parallel1Id, target: parallel2Id, sourceHandle: 'parallel-end-source' },
        ],
        {},
        {
          [parallel1Id]: {
            id: parallel1Id,
            nodes: [nodeInParallel1],
            parallelType: 'count',
            count: 1,
          },
          [parallel2Id]: {
            id: parallel2Id,
            nodes: [nodeInParallel2],
            parallelType: 'count',
            count: 1,
          },
        }
      )

      edgeConstructor.execute(
        workflow,
        dag,
        new Set([nodeInParallel1, nodeInParallel2]),
        new Set(),
        new Set([nodeInParallel1, nodeInParallel2, branch0NodeP1, branch0NodeP2]),
        new Map()
      )

      // The terminal node of parallel1 (branch0NodeP1) should have an edge
      // to the entry node of parallel2 (branch0NodeP2)
      const terminalNodeP1 = dag.nodes.get(branch0NodeP1)!
      expect(terminalNodeP1.outgoingEdges.size).toBe(1)

      const edge = Array.from(terminalNodeP1.outgoingEdges.values())[0]
      expect(edge.target).toBe(branch0NodeP2)

      // Entry node of parallel2 should have incoming edge from parallel1's terminal
      const entryNodeP2 = dag.nodes.get(branch0NodeP2)!
      expect(entryNodeP2.incomingEdges.has(branch0NodeP1)).toBe(true)
    })

    it('should wire edges from parallel to parallel with multiple branches', () => {
      const parallel1Id = 'parallel-1'
      const parallel2Id = 'parallel-2'
      const nodeInParallel1 = 'node-in-p1'
      const nodeInParallel2 = 'node-in-p2'

      // Create 2 branch nodes for each parallel using correct subscript notation
      const p1Branch0 = buildBranchNodeId(nodeInParallel1, 0)
      const p1Branch1 = buildBranchNodeId(nodeInParallel1, 1)
      const p2Branch0 = buildBranchNodeId(nodeInParallel2, 0)
      const p2Branch1 = buildBranchNodeId(nodeInParallel2, 1)

      const dag = createMockDAG([p1Branch0, p1Branch1, p2Branch0, p2Branch1])

      dag.parallelConfigs.set(parallel1Id, {
        id: parallel1Id,
        nodes: [nodeInParallel1],
        parallelType: 'count',
        count: 2,
      } as any)

      dag.parallelConfigs.set(parallel2Id, {
        id: parallel2Id,
        nodes: [nodeInParallel2],
        parallelType: 'count',
        count: 2,
      } as any)

      // Set metadata for all branch nodes
      for (const [nodeId, parallelId, originalId, branchIndex] of [
        [p1Branch0, parallel1Id, nodeInParallel1, 0],
        [p1Branch1, parallel1Id, nodeInParallel1, 1],
        [p2Branch0, parallel2Id, nodeInParallel2, 0],
        [p2Branch1, parallel2Id, nodeInParallel2, 1],
      ] as const) {
        const node = dag.nodes.get(nodeId)!
        node.metadata = {
          isParallelBranch: true,
          branchIndex,
          branchTotal: 2,
          parallelId,
          originalBlockId: originalId,
        }
      }

      const workflow = createMockWorkflow(
        [createMockBlock(nodeInParallel1), createMockBlock(nodeInParallel2)],
        [{ source: parallel1Id, target: parallel2Id, sourceHandle: 'parallel-end-source' }],
        {},
        {
          [parallel1Id]: {
            id: parallel1Id,
            nodes: [nodeInParallel1],
            parallelType: 'count',
            count: 2,
          },
          [parallel2Id]: {
            id: parallel2Id,
            nodes: [nodeInParallel2],
            parallelType: 'count',
            count: 2,
          },
        }
      )

      edgeConstructor.execute(
        workflow,
        dag,
        new Set([nodeInParallel1, nodeInParallel2]),
        new Set(),
        new Set([nodeInParallel1, nodeInParallel2, p1Branch0, p1Branch1, p2Branch0, p2Branch1]),
        new Map()
      )

      // Each terminal branch of parallel1 should have edges to ALL entry branches of parallel2
      // p1Branch0 → p2Branch0, p2Branch1
      // p1Branch1 → p2Branch0, p2Branch1
      const p1Node0 = dag.nodes.get(p1Branch0)!
      const p1Node1 = dag.nodes.get(p1Branch1)!

      expect(p1Node0.outgoingEdges.size).toBe(2)
      expect(p1Node1.outgoingEdges.size).toBe(2)

      const p1Node0Targets = Array.from(p1Node0.outgoingEdges.values()).map((e) => e.target)
      const p1Node1Targets = Array.from(p1Node1.outgoingEdges.values()).map((e) => e.target)

      expect(p1Node0Targets).toContain(p2Branch0)
      expect(p1Node0Targets).toContain(p2Branch1)
      expect(p1Node1Targets).toContain(p2Branch0)
      expect(p1Node1Targets).toContain(p2Branch1)

      // Entry nodes of parallel2 should have incoming edges from both parallel1 terminals
      const p2Node0 = dag.nodes.get(p2Branch0)!
      const p2Node1 = dag.nodes.get(p2Branch1)!

      expect(p2Node0.incomingEdges.has(p1Branch0)).toBe(true)
      expect(p2Node0.incomingEdges.has(p1Branch1)).toBe(true)
      expect(p2Node1.incomingEdges.has(p1Branch0)).toBe(true)
      expect(p2Node1.incomingEdges.has(p1Branch1)).toBe(true)
    })
  })

  describe('Loop and parallel block combinations', () => {
    it('should wire edges from loop block to parallel block', () => {
      // Test Loop → Parallel connection
      const loopId = 'loop-1'
      const parallelId = 'parallel-1'
      const nodeInLoop = 'node-in-loop'
      const nodeInParallel = 'node-in-parallel'

      // Create sentinel nodes for loop and branch nodes for parallel
      const loopSentinelStart = `loop-${loopId}-sentinel-start`
      const loopSentinelEnd = `loop-${loopId}-sentinel-end`
      const parallelBranch0 = buildBranchNodeId(nodeInParallel, 0)

      const dag = createMockDAG([nodeInLoop, loopSentinelStart, loopSentinelEnd, parallelBranch0])

      dag.loopConfigs.set(loopId, {
        id: loopId,
        nodes: [nodeInLoop],
        iterations: 3,
        loopType: 'for',
      } as any)

      dag.parallelConfigs.set(parallelId, {
        id: parallelId,
        nodes: [nodeInParallel],
        parallelType: 'count',
        count: 1,
      } as any)

      // Set metadata for parallel branch node
      const pNode = dag.nodes.get(parallelBranch0)!
      pNode.metadata = {
        isParallelBranch: true,
        branchIndex: 0,
        branchTotal: 1,
        parallelId,
        originalBlockId: nodeInParallel,
      }

      const workflow = createMockWorkflow(
        [createMockBlock(nodeInLoop), createMockBlock(nodeInParallel)],
        [
          // Connection from loop to parallel
          { source: loopId, target: parallelId, sourceHandle: 'loop_exit' },
        ],
        {
          [loopId]: {
            id: loopId,
            nodes: [nodeInLoop],
            iterations: 3,
            loopType: 'for',
          } as any,
        },
        {
          [parallelId]: {
            id: parallelId,
            nodes: [nodeInParallel],
            parallelType: 'count',
            count: 1,
          },
        }
      )

      edgeConstructor.execute(
        workflow,
        dag,
        new Set([nodeInParallel]),
        new Set([nodeInLoop]),
        new Set([nodeInLoop, nodeInParallel, loopSentinelStart, loopSentinelEnd, parallelBranch0]),
        new Map()
      )

      // Loop's sentinel end should have an edge to parallel's entry branch
      const loopEndNode = dag.nodes.get(loopSentinelEnd)!
      const loopEndEdges = Array.from(loopEndNode.outgoingEdges.values())
      const edgeToParallel = loopEndEdges.find((e) => e.target === parallelBranch0)
      expect(edgeToParallel).toBeDefined()
    })

    it('should wire edges from parallel block to loop block', () => {
      // Test Parallel → Loop connection
      const parallelId = 'parallel-1'
      const loopId = 'loop-1'
      const nodeInParallel = 'node-in-parallel'
      const nodeInLoop = 'node-in-loop'

      const parallelBranch0 = buildBranchNodeId(nodeInParallel, 0)
      const loopSentinelStart = `loop-${loopId}-sentinel-start`
      const loopSentinelEnd = `loop-${loopId}-sentinel-end`

      const dag = createMockDAG([parallelBranch0, nodeInLoop, loopSentinelStart, loopSentinelEnd])

      dag.parallelConfigs.set(parallelId, {
        id: parallelId,
        nodes: [nodeInParallel],
        parallelType: 'count',
        count: 1,
      } as any)

      dag.loopConfigs.set(loopId, {
        id: loopId,
        nodes: [nodeInLoop],
        iterations: 3,
        loopType: 'for',
      } as any)

      const pNode = dag.nodes.get(parallelBranch0)!
      pNode.metadata = {
        isParallelBranch: true,
        branchIndex: 0,
        branchTotal: 1,
        parallelId,
        originalBlockId: nodeInParallel,
      }

      const workflow = createMockWorkflow(
        [createMockBlock(nodeInParallel), createMockBlock(nodeInLoop)],
        [
          // Connection from parallel to loop
          { source: parallelId, target: loopId, sourceHandle: 'parallel-end-source' },
        ],
        {
          [loopId]: {
            id: loopId,
            nodes: [nodeInLoop],
            iterations: 3,
            loopType: 'for',
          } as any,
        },
        {
          [parallelId]: {
            id: parallelId,
            nodes: [nodeInParallel],
            parallelType: 'count',
            count: 1,
          },
        }
      )

      edgeConstructor.execute(
        workflow,
        dag,
        new Set([nodeInParallel]),
        new Set([nodeInLoop]),
        new Set([nodeInParallel, nodeInLoop, parallelBranch0, loopSentinelStart, loopSentinelEnd]),
        new Map()
      )

      // Parallel's terminal branch should have an edge to loop's sentinel start
      const parallelBranchNode = dag.nodes.get(parallelBranch0)!
      const parallelEdges = Array.from(parallelBranchNode.outgoingEdges.values())
      const edgeToLoop = parallelEdges.find((e) => e.target === loopSentinelStart)
      expect(edgeToLoop).toBeDefined()
    })
  })

  describe('Consecutive loop blocks', () => {
    it('should wire edges from one loop block to another loop block', () => {
      // Test that Loop1 → Loop2 connections work correctly
      const loop1Id = 'loop-1'
      const loop2Id = 'loop-2'
      const nodeInLoop1 = 'node-in-l1'
      const nodeInLoop2 = 'node-in-l2'

      // Create sentinel nodes for each loop
      const loop1SentinelStart = `loop-${loop1Id}-sentinel-start`
      const loop1SentinelEnd = `loop-${loop1Id}-sentinel-end`
      const loop2SentinelStart = `loop-${loop2Id}-sentinel-start`
      const loop2SentinelEnd = `loop-${loop2Id}-sentinel-end`

      const dag = createMockDAG([
        nodeInLoop1,
        nodeInLoop2,
        loop1SentinelStart,
        loop1SentinelEnd,
        loop2SentinelStart,
        loop2SentinelEnd,
      ])

      // Set up loop configs
      dag.loopConfigs.set(loop1Id, {
        id: loop1Id,
        nodes: [nodeInLoop1],
        iterations: 3,
        loopType: 'for',
      } as any)

      dag.loopConfigs.set(loop2Id, {
        id: loop2Id,
        nodes: [nodeInLoop2],
        iterations: 3,
        loopType: 'for',
      } as any)

      const workflow = createMockWorkflow(
        [createMockBlock(nodeInLoop1), createMockBlock(nodeInLoop2)],
        [
          // Connection from loop1 to loop2 (loop exit to next loop)
          { source: loop1Id, target: loop2Id, sourceHandle: 'loop_exit' },
        ],
        {
          [loop1Id]: {
            id: loop1Id,
            nodes: [nodeInLoop1],
            iterations: 3,
            loopType: 'for',
          } as any,
          [loop2Id]: {
            id: loop2Id,
            nodes: [nodeInLoop2],
            iterations: 3,
            loopType: 'for',
          } as any,
        }
      )

      edgeConstructor.execute(
        workflow,
        dag,
        new Set(),
        new Set([nodeInLoop1, nodeInLoop2]),
        new Set([
          nodeInLoop1,
          nodeInLoop2,
          loop1SentinelStart,
          loop1SentinelEnd,
          loop2SentinelStart,
          loop2SentinelEnd,
        ]),
        new Map()
      )

      // Loop1's sentinel start should have a LOOP_EXIT edge to Loop2's sentinel start
      const l1SentinelStartNode = dag.nodes.get(loop1SentinelStart)!
      const l1StartEdges = Array.from(l1SentinelStartNode.outgoingEdges.values())
      const exitEdgeToL2 = l1StartEdges.find(
        (e) => e.target === loop2SentinelStart && e.sourceHandle === 'loop_exit'
      )
      expect(exitEdgeToL2).toBeDefined()

      // Loop1's sentinel end should also have an edge to Loop2's sentinel start
      const l1SentinelEndNode = dag.nodes.get(loop1SentinelEnd)!
      const l1EndEdges = Array.from(l1SentinelEndNode.outgoingEdges.values())
      const endToL2Edge = l1EndEdges.find((e) => e.target === loop2SentinelStart)
      expect(endToL2Edge).toBeDefined()
    })
  })

  describe('Cross-loop boundary detection', () => {
    it('should not wire edges that cross loop boundaries', () => {
      const outsideId = 'outside'
      const insideId = 'inside'
      const loopId = 'loop-1'

      const workflow = createMockWorkflow(
        [createMockBlock(outsideId), createMockBlock(insideId)],
        [{ source: outsideId, target: insideId }],
        {
          [loopId]: {
            id: loopId,
            nodes: [insideId],
            iterations: 5,
            loopType: 'for',
          } as SerializedLoop,
        }
      )

      const dag = createMockDAG([outsideId, insideId])
      dag.loopConfigs.set(loopId, {
        id: loopId,
        nodes: [insideId],
        iterations: 5,
        loopType: 'for',
      } as SerializedLoop)

      edgeConstructor.execute(
        workflow,
        dag,
        new Set(),
        new Set([insideId]),
        new Set([outsideId, insideId]),
        new Map()
      )

      // Edge should not be wired because it crosses loop boundary
      const outsideNode = dag.nodes.get(outsideId)!
      expect(outsideNode.outgoingEdges.size).toBe(0)
    })
  })

  // ==========================================================================
  // REGRESSION TESTS - Ensure existing functionality still works after fix
  // ==========================================================================
  describe('Regression tests for subflow edge wiring', () => {
    it('should still wire regular block to parallel block entry nodes', () => {
      const regularId = 'regular-block'
      const parallelId = 'parallel-1'
      const nodeInParallel = 'node-in-parallel'

      const pBranch0 = buildBranchNodeId(nodeInParallel, 0)
      const pBranch1 = buildBranchNodeId(nodeInParallel, 1)

      const dag = createMockDAG([regularId, pBranch0, pBranch1])

      dag.parallelConfigs.set(parallelId, {
        id: parallelId,
        nodes: [nodeInParallel],
        parallelType: 'count',
        count: 2,
      } as any)

      // Set up branch metadata
      for (const [nodeId, branchIndex] of [
        [pBranch0, 0],
        [pBranch1, 1],
      ] as const) {
        dag.nodes.get(nodeId)!.metadata = {
          isParallelBranch: true,
          branchIndex,
          branchTotal: 2,
          parallelId,
          originalBlockId: nodeInParallel,
        }
      }

      const workflow = createMockWorkflow(
        [createMockBlock(regularId), createMockBlock(nodeInParallel)],
        [{ source: regularId, target: parallelId }],
        {},
        {
          [parallelId]: {
            id: parallelId,
            nodes: [nodeInParallel],
            parallelType: 'count',
            count: 2,
          },
        }
      )

      edgeConstructor.execute(
        workflow,
        dag,
        new Set([nodeInParallel]),
        new Set(),
        new Set([regularId, nodeInParallel, pBranch0, pBranch1]),
        new Map()
      )

      // Regular block should connect to both parallel branches
      const regularNode = dag.nodes.get(regularId)!
      expect(regularNode.outgoingEdges.size).toBe(2)

      const targets = Array.from(regularNode.outgoingEdges.values()).map((e) => e.target)
      expect(targets).toContain(pBranch0)
      expect(targets).toContain(pBranch1)
    })

    it('should still wire parallel block exit to regular block', () => {
      const parallelId = 'parallel-1'
      const nodeInParallel = 'node-in-parallel'
      const regularId = 'regular-block'

      const pBranch0 = buildBranchNodeId(nodeInParallel, 0)
      const pBranch1 = buildBranchNodeId(nodeInParallel, 1)

      const dag = createMockDAG([pBranch0, pBranch1, regularId])

      dag.parallelConfigs.set(parallelId, {
        id: parallelId,
        nodes: [nodeInParallel],
        parallelType: 'count',
        count: 2,
      } as any)

      for (const [nodeId, branchIndex] of [
        [pBranch0, 0],
        [pBranch1, 1],
      ] as const) {
        dag.nodes.get(nodeId)!.metadata = {
          isParallelBranch: true,
          branchIndex,
          branchTotal: 2,
          parallelId,
          originalBlockId: nodeInParallel,
        }
      }

      const workflow = createMockWorkflow(
        [createMockBlock(nodeInParallel), createMockBlock(regularId)],
        [{ source: parallelId, target: regularId, sourceHandle: 'parallel-end-source' }],
        {},
        {
          [parallelId]: {
            id: parallelId,
            nodes: [nodeInParallel],
            parallelType: 'count',
            count: 2,
          },
        }
      )

      edgeConstructor.execute(
        workflow,
        dag,
        new Set([nodeInParallel]),
        new Set(),
        new Set([nodeInParallel, regularId, pBranch0, pBranch1]),
        new Map()
      )

      // Both parallel branches should connect to regular block
      const p0Node = dag.nodes.get(pBranch0)!
      const p1Node = dag.nodes.get(pBranch1)!

      expect(Array.from(p0Node.outgoingEdges.values()).some((e) => e.target === regularId)).toBe(
        true
      )
      expect(Array.from(p1Node.outgoingEdges.values()).some((e) => e.target === regularId)).toBe(
        true
      )

      // Regular block should have incoming edges from both branches
      const regularNode = dag.nodes.get(regularId)!
      expect(regularNode.incomingEdges.has(pBranch0)).toBe(true)
      expect(regularNode.incomingEdges.has(pBranch1)).toBe(true)
    })

    it('should still wire regular block to loop entry', () => {
      const regularId = 'regular-block'
      const loopId = 'loop-1'
      const nodeInLoop = 'node-in-loop'

      const sentinelStart = buildSentinelStartId(loopId)
      const sentinelEnd = buildSentinelEndId(loopId)

      const dag = createMockDAG([regularId, nodeInLoop, sentinelStart, sentinelEnd])

      dag.loopConfigs.set(loopId, {
        id: loopId,
        nodes: [nodeInLoop],
        iterations: 3,
        loopType: 'for',
      } as SerializedLoop)

      const workflow = createMockWorkflow(
        [createMockBlock(regularId), createMockBlock(nodeInLoop)],
        [{ source: regularId, target: loopId }],
        {
          [loopId]: {
            id: loopId,
            nodes: [nodeInLoop],
            iterations: 3,
            loopType: 'for',
          } as SerializedLoop,
        }
      )

      edgeConstructor.execute(
        workflow,
        dag,
        new Set(),
        new Set([nodeInLoop]),
        new Set([regularId, nodeInLoop, sentinelStart, sentinelEnd]),
        new Map()
      )

      // Regular block should connect to loop's sentinel start
      const regularNode = dag.nodes.get(regularId)!
      const edgeToLoop = Array.from(regularNode.outgoingEdges.values()).find(
        (e) => e.target === sentinelStart
      )
      expect(edgeToLoop).toBeDefined()
    })

    it('should still wire loop exit to regular block', () => {
      const loopId = 'loop-1'
      const nodeInLoop = 'node-in-loop'
      const regularId = 'regular-block'

      const sentinelStart = buildSentinelStartId(loopId)
      const sentinelEnd = buildSentinelEndId(loopId)

      const dag = createMockDAG([nodeInLoop, sentinelStart, sentinelEnd, regularId])

      dag.loopConfigs.set(loopId, {
        id: loopId,
        nodes: [nodeInLoop],
        iterations: 3,
        loopType: 'for',
      } as SerializedLoop)

      const workflow = createMockWorkflow(
        [createMockBlock(nodeInLoop), createMockBlock(regularId)],
        [{ source: loopId, target: regularId, sourceHandle: 'loop_exit' }],
        {
          [loopId]: {
            id: loopId,
            nodes: [nodeInLoop],
            iterations: 3,
            loopType: 'for',
          } as SerializedLoop,
        }
      )

      edgeConstructor.execute(
        workflow,
        dag,
        new Set(),
        new Set([nodeInLoop]),
        new Set([nodeInLoop, regularId, sentinelStart, sentinelEnd]),
        new Map()
      )

      // Loop's sentinel start should have LOOP_EXIT edge to regular block
      const sentinelStartNode = dag.nodes.get(sentinelStart)!
      const exitEdge = Array.from(sentinelStartNode.outgoingEdges.values()).find(
        (e) => e.target === regularId && e.sourceHandle === 'loop_exit'
      )
      expect(exitEdge).toBeDefined()

      // Loop's sentinel end should also connect to regular block
      const sentinelEndNode = dag.nodes.get(sentinelEnd)!
      const endEdge = Array.from(sentinelEndNode.outgoingEdges.values()).find(
        (e) => e.target === regularId
      )
      expect(endEdge).toBeDefined()
    })
  })

  // ==========================================================================
  // ADDITIONAL EDGE CASES
  // ==========================================================================
  describe('Edge cases for subflow connections', () => {
    it('should handle three consecutive parallel blocks', () => {
      const p1Id = 'parallel-1'
      const p2Id = 'parallel-2'
      const p3Id = 'parallel-3'
      const node1 = 'node-1'
      const node2 = 'node-2'
      const node3 = 'node-3'

      const p1Branch = buildBranchNodeId(node1, 0)
      const p2Branch = buildBranchNodeId(node2, 0)
      const p3Branch = buildBranchNodeId(node3, 0)

      const dag = createMockDAG([p1Branch, p2Branch, p3Branch])

      for (const [pId, nodeId, branchId] of [
        [p1Id, node1, p1Branch],
        [p2Id, node2, p2Branch],
        [p3Id, node3, p3Branch],
      ] as const) {
        dag.parallelConfigs.set(pId, {
          id: pId,
          nodes: [nodeId],
          parallelType: 'count',
          count: 1,
        } as any)
        dag.nodes.get(branchId)!.metadata = {
          isParallelBranch: true,
          branchIndex: 0,
          branchTotal: 1,
          parallelId: pId,
          originalBlockId: nodeId,
        }
      }

      const workflow = createMockWorkflow(
        [createMockBlock(node1), createMockBlock(node2), createMockBlock(node3)],
        [
          { source: p1Id, target: p2Id, sourceHandle: 'parallel-end-source' },
          { source: p2Id, target: p3Id, sourceHandle: 'parallel-end-source' },
        ],
        {},
        {
          [p1Id]: { id: p1Id, nodes: [node1], parallelType: 'count', count: 1 },
          [p2Id]: { id: p2Id, nodes: [node2], parallelType: 'count', count: 1 },
          [p3Id]: { id: p3Id, nodes: [node3], parallelType: 'count', count: 1 },
        }
      )

      edgeConstructor.execute(
        workflow,
        dag,
        new Set([node1, node2, node3]),
        new Set(),
        new Set([node1, node2, node3, p1Branch, p2Branch, p3Branch]),
        new Map()
      )

      // P1 → P2
      const p1Node = dag.nodes.get(p1Branch)!
      expect(Array.from(p1Node.outgoingEdges.values()).some((e) => e.target === p2Branch)).toBe(
        true
      )

      // P2 → P3
      const p2Node = dag.nodes.get(p2Branch)!
      expect(Array.from(p2Node.outgoingEdges.values()).some((e) => e.target === p3Branch)).toBe(
        true
      )
    })

    it('should handle loop with multiple branches to parallel with multiple branches', () => {
      const loopId = 'loop-1'
      const parallelId = 'parallel-1'
      const nodeInLoop = 'node-in-loop'
      const nodeInParallel = 'node-in-parallel'

      const sentinelStart = buildSentinelStartId(loopId)
      const sentinelEnd = buildSentinelEndId(loopId)
      const pBranch0 = buildBranchNodeId(nodeInParallel, 0)
      const pBranch1 = buildBranchNodeId(nodeInParallel, 1)
      const pBranch2 = buildBranchNodeId(nodeInParallel, 2)

      const dag = createMockDAG([
        nodeInLoop,
        sentinelStart,
        sentinelEnd,
        pBranch0,
        pBranch1,
        pBranch2,
      ])

      dag.loopConfigs.set(loopId, {
        id: loopId,
        nodes: [nodeInLoop],
        iterations: 3,
        loopType: 'for',
      } as SerializedLoop)

      dag.parallelConfigs.set(parallelId, {
        id: parallelId,
        nodes: [nodeInParallel],
        parallelType: 'count',
        count: 3,
      } as any)

      for (const [branchId, idx] of [
        [pBranch0, 0],
        [pBranch1, 1],
        [pBranch2, 2],
      ] as const) {
        dag.nodes.get(branchId)!.metadata = {
          isParallelBranch: true,
          branchIndex: idx,
          branchTotal: 3,
          parallelId,
          originalBlockId: nodeInParallel,
        }
      }

      const workflow = createMockWorkflow(
        [createMockBlock(nodeInLoop), createMockBlock(nodeInParallel)],
        [{ source: loopId, target: parallelId, sourceHandle: 'loop_exit' }],
        {
          [loopId]: {
            id: loopId,
            nodes: [nodeInLoop],
            iterations: 3,
            loopType: 'for',
          } as SerializedLoop,
        },
        {
          [parallelId]: {
            id: parallelId,
            nodes: [nodeInParallel],
            parallelType: 'count',
            count: 3,
          },
        }
      )

      edgeConstructor.execute(
        workflow,
        dag,
        new Set([nodeInParallel]),
        new Set([nodeInLoop]),
        new Set([
          nodeInLoop,
          nodeInParallel,
          sentinelStart,
          sentinelEnd,
          pBranch0,
          pBranch1,
          pBranch2,
        ]),
        new Map()
      )

      // Loop sentinel end should connect to ALL parallel branches
      // (plus the loop_continue edge back to sentinel start = 4 total)
      const sentinelEndNode = dag.nodes.get(sentinelEnd)!
      expect(sentinelEndNode.outgoingEdges.size).toBe(4)

      const targets = Array.from(sentinelEndNode.outgoingEdges.values()).map((e) => e.target)
      expect(targets).toContain(pBranch0)
      expect(targets).toContain(pBranch1)
      expect(targets).toContain(pBranch2)
      expect(targets).toContain(sentinelStart) // loop_continue edge
    })

    it('should handle parallel with multiple branches to loop', () => {
      const parallelId = 'parallel-1'
      const loopId = 'loop-1'
      const nodeInParallel = 'node-in-parallel'
      const nodeInLoop = 'node-in-loop'

      const pBranch0 = buildBranchNodeId(nodeInParallel, 0)
      const pBranch1 = buildBranchNodeId(nodeInParallel, 1)
      const sentinelStart = buildSentinelStartId(loopId)
      const sentinelEnd = buildSentinelEndId(loopId)

      const dag = createMockDAG([pBranch0, pBranch1, nodeInLoop, sentinelStart, sentinelEnd])

      dag.parallelConfigs.set(parallelId, {
        id: parallelId,
        nodes: [nodeInParallel],
        parallelType: 'count',
        count: 2,
      } as any)

      dag.loopConfigs.set(loopId, {
        id: loopId,
        nodes: [nodeInLoop],
        iterations: 3,
        loopType: 'for',
      } as SerializedLoop)

      for (const [branchId, idx] of [
        [pBranch0, 0],
        [pBranch1, 1],
      ] as const) {
        dag.nodes.get(branchId)!.metadata = {
          isParallelBranch: true,
          branchIndex: idx,
          branchTotal: 2,
          parallelId,
          originalBlockId: nodeInParallel,
        }
      }

      const workflow = createMockWorkflow(
        [createMockBlock(nodeInParallel), createMockBlock(nodeInLoop)],
        [{ source: parallelId, target: loopId, sourceHandle: 'parallel-end-source' }],
        {
          [loopId]: {
            id: loopId,
            nodes: [nodeInLoop],
            iterations: 3,
            loopType: 'for',
          } as SerializedLoop,
        },
        {
          [parallelId]: {
            id: parallelId,
            nodes: [nodeInParallel],
            parallelType: 'count',
            count: 2,
          },
        }
      )

      edgeConstructor.execute(
        workflow,
        dag,
        new Set([nodeInParallel]),
        new Set([nodeInLoop]),
        new Set([nodeInParallel, nodeInLoop, pBranch0, pBranch1, sentinelStart, sentinelEnd]),
        new Map()
      )

      // Both parallel branches should connect to loop sentinel start
      const p0Node = dag.nodes.get(pBranch0)!
      const p1Node = dag.nodes.get(pBranch1)!

      expect(
        Array.from(p0Node.outgoingEdges.values()).some((e) => e.target === sentinelStart)
      ).toBe(true)
      expect(
        Array.from(p1Node.outgoingEdges.values()).some((e) => e.target === sentinelStart)
      ).toBe(true)

      // Loop sentinel start should have incoming from both branches
      const sentinelStartNode = dag.nodes.get(sentinelStart)!
      expect(sentinelStartNode.incomingEdges.has(pBranch0)).toBe(true)
      expect(sentinelStartNode.incomingEdges.has(pBranch1)).toBe(true)
    })

    it('should handle mixed chain: parallel → loop → parallel', () => {
      const p1Id = 'parallel-1'
      const loopId = 'loop-1'
      const p2Id = 'parallel-2'
      const p1Node = 'p1-node'
      const loopNode = 'loop-node'
      const p2Node = 'p2-node'

      const p1Branch = buildBranchNodeId(p1Node, 0)
      const sentinelStart = buildSentinelStartId(loopId)
      const sentinelEnd = buildSentinelEndId(loopId)
      const p2Branch = buildBranchNodeId(p2Node, 0)

      const dag = createMockDAG([p1Branch, loopNode, sentinelStart, sentinelEnd, p2Branch])

      dag.parallelConfigs.set(p1Id, {
        id: p1Id,
        nodes: [p1Node],
        parallelType: 'count',
        count: 1,
      } as any)
      dag.parallelConfigs.set(p2Id, {
        id: p2Id,
        nodes: [p2Node],
        parallelType: 'count',
        count: 1,
      } as any)
      dag.loopConfigs.set(loopId, {
        id: loopId,
        nodes: [loopNode],
        iterations: 3,
        loopType: 'for',
      } as SerializedLoop)

      dag.nodes.get(p1Branch)!.metadata = {
        isParallelBranch: true,
        branchIndex: 0,
        branchTotal: 1,
        parallelId: p1Id,
        originalBlockId: p1Node,
      }
      dag.nodes.get(p2Branch)!.metadata = {
        isParallelBranch: true,
        branchIndex: 0,
        branchTotal: 1,
        parallelId: p2Id,
        originalBlockId: p2Node,
      }

      const workflow = createMockWorkflow(
        [createMockBlock(p1Node), createMockBlock(loopNode), createMockBlock(p2Node)],
        [
          { source: p1Id, target: loopId, sourceHandle: 'parallel-end-source' },
          { source: loopId, target: p2Id, sourceHandle: 'loop_exit' },
        ],
        {
          [loopId]: {
            id: loopId,
            nodes: [loopNode],
            iterations: 3,
            loopType: 'for',
          } as SerializedLoop,
        },
        {
          [p1Id]: { id: p1Id, nodes: [p1Node], parallelType: 'count', count: 1 },
          [p2Id]: { id: p2Id, nodes: [p2Node], parallelType: 'count', count: 1 },
        }
      )

      edgeConstructor.execute(
        workflow,
        dag,
        new Set([p1Node, p2Node]),
        new Set([loopNode]),
        new Set([p1Node, loopNode, p2Node, p1Branch, sentinelStart, sentinelEnd, p2Branch]),
        new Map()
      )

      // P1 → Loop (sentinel start)
      const p1BranchNode = dag.nodes.get(p1Branch)!
      expect(
        Array.from(p1BranchNode.outgoingEdges.values()).some((e) => e.target === sentinelStart)
      ).toBe(true)

      // Loop → P2 (sentinel end to P2 branch)
      const sentinelEndNode = dag.nodes.get(sentinelEnd)!
      expect(
        Array.from(sentinelEndNode.outgoingEdges.values()).some((e) => e.target === p2Branch)
      ).toBe(true)
    })
  })
})
