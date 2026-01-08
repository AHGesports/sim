# Git-Like Workflow Version Control - Implementation Plan v2

---

## Goal & Vision

### What We're Building

A **Git-like version control system for JSON workflows** that enables:

1. **Global Workflows as "Main Branch"** - Shared workflow templates that serve as the canonical version
2. **Agent Forks** - Each agent can fork a global workflow and customize it for their specific needs
3. **Pull Updates** - When the global workflow improves, agents can pull those changes into their forks
4. **Conflict Resolution** - When both main and fork edit the same field, users choose which version to keep

### User Stories

| As a... | I want to... | So that... |
|---------|--------------|------------|
| **Admin** | Create a global "Customer Support" workflow | All agents start from the same template |
| **Agent** | Fork the global workflow and customize prompts | My version fits my communication style |
| **Admin** | Update the global workflow with new blocks | All agents benefit from improvements |
| **Agent** | Pull updates from global without losing my changes | I stay current while keeping customizations |
| **Agent** | See what changed before pulling | I can decide if the update is relevant |
| **Agent** | Choose my version when there's a conflict | My intentional customizations aren't overwritten |

### The Core Problem

```
Day 1: Admin creates "Customer Support" workflow
       Agent A forks it, customizes the greeting prompt

Day 5: Admin adds a new "Escalation" block to global

Day 6: Agent A wants the Escalation block BUT also changed
       the same greeting prompt that Admin also updated

       → How do we merge both changes intelligently?
       → How do we let Agent A choose which greeting to keep?
```

---

## Requirements for Library Selection

### Must Have (Non-Negotiable)

| Requirement | Why |
|-------------|-----|
| **JSON-native** | Workflows are JSON, not text files |
| **Conflict detection API** | Users must see AND choose between concurrent edits |
| **Branching/forking** | Each agent needs independent version |
| **Merge capability** | Pull changes from main into fork |
| **Binary export** | Store in PostgreSQL, not filesystem |
| **JavaScript/TypeScript** | Runs in Next.js backend |

### Should Have (Important)

| Requirement | Why |
|-------------|-----|
| **Version history** | Browse past versions, time travel |
| **Mature/production-ready** | Can't use experimental libraries |
| **Small bundle size** | Performance matters |
| **Active maintenance** | Long-term viability |

### Nice to Have (Bonus)

| Requirement | Why |
|-------------|-----|
| **Git-like visualization** | Familiar UX for developers |
| **Incremental sync** | Only transfer changes, not full doc |
| **Real-time collaboration** | Future feature possibility |

### Deal Breakers (Disqualifying)

| Anti-Pattern | Why It's a Problem |
|--------------|-------------------|
| **File-based only** | We use PostgreSQL, not filesystem |
| **Silent LWW without conflict exposure** | Users lose data without knowing |
| **Requires external service** | Must be self-contained |
| **No JavaScript support** | Can't integrate with Next.js |

---

## Executive Summary

**Solution: Automerge CRDT** - A JSON-native version control library with built-in conflict detection.

**Key Advantage:** Unlike pure Git or other CRDTs, Automerge exposes conflicts via `getConflicts()` API, allowing users to see and resolve concurrent edits rather than silently losing data.

---

## Part 1: Why Not Just Use Git?

### The Problem with Git for JSON Workflows

| Issue | Git Behavior | Impact on Workflows |
|-------|--------------|---------------------|
| **File-based, not JSON-native** | Treats JSON as text lines | Meaningless diffs like "line 47 changed" |
| **Line-based merge** | Merges by text lines | Can corrupt JSON structure |
| **Requires filesystem** | Needs `.git` folder, index, objects | Heavy for browser/PostgreSQL storage |
| **No semantic understanding** | Doesn't know what a "block" is | Can't merge block A + block B intelligently |
| **Binary conflict markers** | `<<<<<<< HEAD` in files | Breaks JSON parsing entirely |

### Example: Git Fails at JSON

```
Main adds:    { "blocks": { "A": {...}, "B": {...} } }
Fork adds:    { "blocks": { "A": {...}, "C": {...} } }

Git result:   CONFLICT - manual resolution required
              <<<<<<< HEAD
              "B": {...}
              =======
              "C": {...}
              >>>>>>> fork

Automerge:    { "blocks": { "A": {...}, "B": {...}, "C": {...} } }
              (Automatically merged - both blocks preserved!)
```

### When Git-Based Approaches Make Sense

- **File-based workflows** (YAML, like Kestra/Windmill)
- **External sync** (push to GitHub for backup)
- **CI/CD pipelines** (deploy on merge)

For our JSON-based workflows with in-app branching, a JSON-native CRDT is superior.

---

## Part 2: Approaches We Evaluated (Not Chosen)

### Libraries/Approaches Not Ideal for This Use Case

| Name | Why Not Chosen |
|------|----------------|
| **isomorphic-git** | File-based, requires IndexedDB filesystem emulation, no JSON awareness |
| **Loro** | No `getConflicts()` API - silently overwrites losing values with LWW |
| **Yjs** | Optimized for real-time collab, not versioning/branching |
| **trimerge** | Experimental, low adoption, requires manual conflict handling |
| **three-way-merge** | Text-focused, 8 years old, limited JSON support |
| **nodegit/libgit2** | Native bindings, heavy, file-based |
| **Manual diff3 algorithm** | Reinventing the wheel, error-prone |
| **Windmill approach** | CLI-based Git sync, requires external Git repo |
| **Kestra approach** | YAML files in Git, "Git always wins" philosophy |
| **n8n approach** | Environment-based branches, no true forking |

---

## Part 3: Why Automerge

### The Killer Feature: `getConflicts()`

```javascript
import * as Automerge from '@automerge/automerge'

// Two users concurrently edit the same block's prompt
// Main: "Analyze the data"
// Fork: "Summarize the data"

const merged = Automerge.merge(forkDoc, mainDoc)

// Automerge picks a winner (LWW), BUT preserves the loser!
console.log(merged.blocks['A'].prompt)
// => "Summarize the data" (winner)

const conflicts = Automerge.getConflicts(merged.blocks['A'], 'prompt')
// => { '1@main': "Analyze the data", '1@fork': "Summarize the data" }

// NOW we can show the user both options and let them choose!
```

### Automerge vs Loro Comparison

| Feature | Automerge | Loro |
|---------|-----------|------|
| **Conflict Detection** | ✅ `getConflicts()` returns all values | ❌ No API - loser is lost |
| **Version History** | ✅ `getHistory()`, `diff()` | ✅ `oplogVersion()` |
| **Branching** | ✅ `clone()` creates fork | ✅ `fork()` |
| **Merge** | ✅ `merge()` with conflict tracking | ✅ `import()` auto-merge |
| **JSON Native** | ✅ Designed for JSON docs | ✅ Designed for JSON |
| **Maturity** | ✅ v3.x, production-ready | ⚠️ v1.0, newer |
| **Bundle Size** | ~300KB | ~500KB (WASM) |

### What Automerge Handles Automatically (No Code Needed)

| Scenario | Resolution |
|----------|------------|
| Both add different blocks | ✅ Both blocks preserved |
| Both add same edge | ✅ Deduplicated |
| Both delete same block | ✅ Block deleted once |
| Main edits A, Fork edits B | ✅ Both edits preserved |
| Both edit same field | ⚠️ LWW winner + `getConflicts()` for user choice |

---

## Part 4: Architecture

### Storage Strategy (PostgreSQL Only)

```
┌─────────────────────────────────────────────────────────────────┐
│                        PostgreSQL                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ workflow_version:                                        │   │
│  │   - id, workflow_family_id                               │   │
│  │   - automerge_binary (BYTEA) → Automerge doc binary     │   │
│  │   - version_hash (Automerge heads)                      │   │
│  │   - branch_name ('main' | 'agent/{id}')                 │   │
│  │   - parent_version_id                                    │   │
│  │   - message, author_id, created_at                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ workflow_branch:                                         │   │
│  │   - id, workflow_family_id, name                        │   │
│  │   - head_version_id, fork_point_version_id              │   │
│  │   - agent_id, last_synced_main_version_id               │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Branch Model

```
Global Workflow (main)
    │
    ├── v1 (initial)
    ├── v2 (add block A)
    ├── v3 (modify block B)  ← Agent forks here
    │   │
    │   └── Agent Fork (agent/123)
    │       ├── v3-fork (fork point)
    │       ├── v4-agent (agent customizes prompt)
    │       └── v5-agent (agent adds block C)
    │
    ├── v4 (main adds block D)
    └── v5 (main modifies block A prompt)  ← CONFLICT with agent's v4!
        │
        └── Agent pulls v5
            ├── Auto-merged: block D added ✓
            └── CONFLICT: block A prompt
                ├── Main: "Analyze data carefully"
                └── Fork: "Summarize data briefly"
                → Show user both, let them pick!
```

---

## Part 5: Implementation

### Phase 1: Automerge Infrastructure (2-3 days)

#### 1.1 Install Dependencies

```bash
bun add @automerge/automerge
bun add commit-graph  # For visualization
```

#### 1.2 Automerge Service

```typescript
// apps/sim/lib/workflows/automerge/automerge-service.ts (~100 lines)
import * as Automerge from '@automerge/automerge'

interface WorkflowDoc {
  blocks: Record<string, Block>
  edges: Edge[]
  loops: Record<string, Loop>
  parallels: Record<string, Parallel>
  metadata: WorkflowMetadata
  variables: Variable[]
}

export class WorkflowAutomergeService {
  private doc: Automerge.Doc<WorkflowDoc>

  constructor() {
    this.doc = Automerge.init<WorkflowDoc>()
  }

  // Initialize from existing workflow state
  static fromWorkflowState(state: WorkflowState): WorkflowAutomergeService {
    const service = new WorkflowAutomergeService()
    service.doc = Automerge.from<WorkflowDoc>({
      blocks: state.blocks,
      edges: state.edges,
      loops: state.loops,
      parallels: state.parallels,
      metadata: state.metadata,
      variables: state.variables,
    })
    return service
  }

  // Load from database binary
  static fromBinary(binary: Uint8Array): WorkflowAutomergeService {
    const service = new WorkflowAutomergeService()
    service.doc = Automerge.load<WorkflowDoc>(binary)
    return service
  }

  // Fork (clone) for agent branch
  fork(): WorkflowAutomergeService {
    const forked = new WorkflowAutomergeService()
    forked.doc = Automerge.clone(this.doc)
    return forked
  }

  // Export for storage
  save(): Uint8Array {
    return Automerge.save(this.doc)
  }

  // Get current state as JSON
  toWorkflowState(): WorkflowState {
    return { ...this.doc }
  }

  // Get version hash (heads)
  getVersionHash(): string {
    return Automerge.getHeads(this.doc).join(',')
  }

  // Apply changes
  change(description: string, fn: (doc: WorkflowDoc) => void): void {
    this.doc = Automerge.change(this.doc, description, fn)
  }

  // MERGE with conflict detection!
  merge(other: WorkflowAutomergeService): MergeResult {
    const beforeHeads = Automerge.getHeads(this.doc)
    this.doc = Automerge.merge(this.doc, other.doc)

    // Detect conflicts
    const conflicts = this.detectConflicts()

    return {
      merged: true,
      conflicts,
      hasConflicts: conflicts.length > 0,
    }
  }

  // THE KEY METHOD: Detect all conflicts after merge
  private detectConflicts(): ConflictInfo[] {
    const conflicts: ConflictInfo[] = []

    // Check each block for conflicts
    for (const [blockId, block] of Object.entries(this.doc.blocks)) {
      for (const [field, value] of Object.entries(block)) {
        const fieldConflicts = Automerge.getConflicts(block, field)
        if (fieldConflicts && Object.keys(fieldConflicts).length > 1) {
          conflicts.push({
            type: 'block_field',
            blockId,
            field,
            currentValue: value,
            alternatives: fieldConflicts,
          })
        }
      }

      // Check subBlocks
      if (block.subBlocks) {
        for (const [subBlockId, subBlock] of Object.entries(block.subBlocks)) {
          const valueConflicts = Automerge.getConflicts(subBlock, 'value')
          if (valueConflicts && Object.keys(valueConflicts).length > 1) {
            conflicts.push({
              type: 'subblock_value',
              blockId,
              subBlockId,
              field: 'value',
              currentValue: subBlock.value,
              alternatives: valueConflicts,
            })
          }
        }
      }
    }

    // Check metadata conflicts
    for (const [field, value] of Object.entries(this.doc.metadata)) {
      const metaConflicts = Automerge.getConflicts(this.doc.metadata, field)
      if (metaConflicts && Object.keys(metaConflicts).length > 1) {
        conflicts.push({
          type: 'metadata',
          field,
          currentValue: value,
          alternatives: metaConflicts,
        })
      }
    }

    return conflicts
  }

  // Resolve a conflict by choosing a specific value
  resolveConflict(path: string[], chosenOpId: string): void {
    // Get the value from the chosen operation
    const conflicts = this.getConflictsAtPath(path)
    const chosenValue = conflicts[chosenOpId]

    // Apply the chosen value (this clears the conflict)
    this.change(`Resolve conflict: chose ${chosenOpId}`, doc => {
      let target: any = doc
      for (let i = 0; i < path.length - 1; i++) {
        target = target[path[i]]
      }
      target[path[path.length - 1]] = chosenValue
    })
  }

  // Get history
  getHistory(): VersionInfo[] {
    return Automerge.getHistory(this.doc).map(entry => ({
      hash: entry.change.hash,
      message: entry.change.message,
      timestamp: entry.change.time,
      actor: entry.change.actor,
    }))
  }
}

interface ConflictInfo {
  type: 'block_field' | 'subblock_value' | 'metadata'
  blockId?: string
  subBlockId?: string
  field: string
  currentValue: unknown
  alternatives: Record<string, unknown>  // opId -> value
}

interface MergeResult {
  merged: boolean
  conflicts: ConflictInfo[]
  hasConflicts: boolean
}
```

#### 1.3 Database Schema

```typescript
// packages/db/schema.ts (additions)

export const workflowVersion = pgTable('workflow_version', {
  id: text('id').primaryKey(),
  workflowFamilyId: text('workflow_family_id').notNull(),
  automergeBinary: bytea('automerge_binary').notNull(),
  versionHash: text('version_hash').notNull(),
  parentVersionId: text('parent_version_id'),
  branchName: text('branch_name').notNull().default('main'),
  message: text('message').notNull(),
  authorId: text('author_id'),
  authorType: text('author_type'), // 'user' | 'copilot' | 'system'
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  familyBranchIdx: index('wv_family_branch_idx').on(table.workflowFamilyId, table.branchName),
  createdAtIdx: index('wv_created_at_idx').on(table.createdAt),
}))

export const workflowBranch = pgTable('workflow_branch', {
  id: text('id').primaryKey(),
  workflowFamilyId: text('workflow_family_id').notNull(),
  name: text('name').notNull(),
  headVersionId: text('head_version_id'),
  forkPointVersionId: text('fork_point_version_id'),
  agentId: text('agent_id'),
  lastSyncedMainVersionId: text('last_synced_main_version_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  familyNameUnique: uniqueIndex('wb_family_name_unique').on(table.workflowFamilyId, table.name),
}))
```

### Phase 2: Fork & Pull Operations (2 days)

#### 2.1 Fork Service

```typescript
// apps/sim/lib/workflows/automerge/fork-service.ts (~50 lines)

export async function forkWorkflowToAgent(
  workflowFamilyId: string,
  agentId: string
): Promise<{ branchName: string; versionId: string }> {
  // Get latest main version
  const mainVersion = await db.query.workflowVersion.findFirst({
    where: and(
      eq(workflowVersion.workflowFamilyId, workflowFamilyId),
      eq(workflowVersion.branchName, 'main')
    ),
    orderBy: desc(workflowVersion.createdAt),
  })

  if (!mainVersion) {
    throw new Error('No main version found')
  }

  // Load and fork the Automerge doc
  const mainService = WorkflowAutomergeService.fromBinary(mainVersion.automergeBinary)
  const forkedService = mainService.fork()

  const branchName = `agent/${agentId}`
  const versionId = createId()

  // Create branch record
  await db.insert(workflowBranch).values({
    id: createId(),
    workflowFamilyId,
    name: branchName,
    headVersionId: versionId,
    forkPointVersionId: mainVersion.id,
    agentId,
    lastSyncedMainVersionId: mainVersion.id,
  })

  // Create initial fork version
  await db.insert(workflowVersion).values({
    id: versionId,
    workflowFamilyId,
    automergeBinary: forkedService.save(),
    versionHash: forkedService.getVersionHash(),
    parentVersionId: mainVersion.id,
    branchName,
    message: `Forked from main for agent ${agentId}`,
    authorType: 'system',
  })

  return { branchName, versionId }
}
```

#### 2.2 Pull/Merge Service

```typescript
// apps/sim/lib/workflows/automerge/merge-service.ts (~80 lines)

export interface PullResult {
  success: boolean
  conflicts: ConflictInfo[]
  hasConflicts: boolean
  newVersionId: string
  changesApplied: number
}

export async function pullFromMain(
  workflowFamilyId: string,
  agentBranchName: string
): Promise<PullResult> {
  // Get agent's current state
  const agentVersion = await getLatestVersion(workflowFamilyId, agentBranchName)
  const agentService = WorkflowAutomergeService.fromBinary(agentVersion.automergeBinary)

  // Get branch info
  const branch = await db.query.workflowBranch.findFirst({
    where: and(
      eq(workflowBranch.workflowFamilyId, workflowFamilyId),
      eq(workflowBranch.name, agentBranchName)
    ),
  })

  // Get main versions since last sync
  const mainVersions = await db.query.workflowVersion.findMany({
    where: and(
      eq(workflowVersion.workflowFamilyId, workflowFamilyId),
      eq(workflowVersion.branchName, 'main'),
      gt(workflowVersion.createdAt,
         (await db.query.workflowVersion.findFirst({
           where: eq(workflowVersion.id, branch.lastSyncedMainVersionId)
         })).createdAt
      )
    ),
    orderBy: asc(workflowVersion.createdAt),
  })

  if (mainVersions.length === 0) {
    return { success: true, conflicts: [], hasConflicts: false, newVersionId: agentVersion.id, changesApplied: 0 }
  }

  // Merge each main version (preserves full history)
  let allConflicts: ConflictInfo[] = []
  for (const mainVer of mainVersions) {
    const mainService = WorkflowAutomergeService.fromBinary(mainVer.automergeBinary)
    const result = agentService.merge(mainService)
    allConflicts = [...allConflicts, ...result.conflicts]
  }

  // Save merged state
  const newVersionId = createId()
  await db.insert(workflowVersion).values({
    id: newVersionId,
    workflowFamilyId,
    automergeBinary: agentService.save(),
    versionHash: agentService.getVersionHash(),
    parentVersionId: agentVersion.id,
    branchName: agentBranchName,
    message: `Merged ${mainVersions.length} updates from main`,
    authorType: 'system',
  })

  // Update branch pointer
  await db.update(workflowBranch)
    .set({
      headVersionId: newVersionId,
      lastSyncedMainVersionId: mainVersions.at(-1)!.id,
      updatedAt: new Date(),
    })
    .where(eq(workflowBranch.name, agentBranchName))

  return {
    success: true,
    conflicts: allConflicts,
    hasConflicts: allConflicts.length > 0,
    newVersionId,
    changesApplied: mainVersions.length,
  }
}
```

### Phase 3: Conflict Resolution UI (2-3 days)

#### 3.1 Conflict Resolution Modal

```typescript
// apps/sim/components/workflow-conflicts/conflict-resolution-modal.tsx (~120 lines)

interface ConflictResolutionModalProps {
  conflicts: ConflictInfo[]
  onResolve: (resolutions: Record<string, string>) => void
  onCancel: () => void
}

export function ConflictResolutionModal({
  conflicts,
  onResolve,
  onCancel
}: ConflictResolutionModalProps) {
  const [resolutions, setResolutions] = useState<Record<string, string>>({})

  // Group conflicts by block for better UX
  const conflictsByBlock = useMemo(() => {
    return conflicts.reduce((acc, conflict) => {
      const key = conflict.blockId || 'metadata'
      if (!acc[key]) acc[key] = []
      acc[key].push(conflict)
      return acc
    }, {} as Record<string, ConflictInfo[]>)
  }, [conflicts])

  return (
    <Dialog open onOpenChange={() => onCancel()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Resolve {conflicts.length} Conflict{conflicts.length > 1 ? 's' : ''}
          </DialogTitle>
          <DialogDescription>
            Both you and main edited the same fields. Choose which version to keep.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {Object.entries(conflictsByBlock).map(([blockId, blockConflicts]) => (
            <div key={blockId} className="border rounded-lg p-4">
              <h4 className="font-medium mb-3">
                {blockId === 'metadata' ? 'Workflow Settings' : `Block: ${blockId.slice(0, 8)}...`}
              </h4>

              {blockConflicts.map((conflict, idx) => (
                <ConflictItem
                  key={`${blockId}-${conflict.field}-${idx}`}
                  conflict={conflict}
                  selected={resolutions[getConflictKey(conflict)]}
                  onSelect={(opId) => setResolutions(prev => ({
                    ...prev,
                    [getConflictKey(conflict)]: opId
                  }))}
                />
              ))}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel Pull
          </Button>
          <Button
            onClick={() => onResolve(resolutions)}
            disabled={Object.keys(resolutions).length !== conflicts.length}
          >
            Apply Resolutions ({Object.keys(resolutions).length}/{conflicts.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ConflictItem({ conflict, selected, onSelect }: {
  conflict: ConflictInfo
  selected?: string
  onSelect: (opId: string) => void
}) {
  const alternatives = Object.entries(conflict.alternatives)

  return (
    <div className="mb-4 last:mb-0">
      <Label className="text-sm text-muted-foreground mb-2 block">
        {conflict.field}
      </Label>

      <div className="space-y-2">
        {alternatives.map(([opId, value]) => {
          const isMain = opId.includes('main')
          const label = isMain ? 'Main version' : 'Your version'

          return (
            <button
              key={opId}
              onClick={() => onSelect(opId)}
              className={cn(
                'w-full p-3 rounded-md border text-left transition-colors',
                selected === opId
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={cn(
                  'text-xs font-medium px-2 py-0.5 rounded',
                  isMain ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                )}>
                  {label}
                </span>
                {selected === opId && <Check className="h-4 w-4 text-primary" />}
              </div>
              <code className="text-sm block mt-1 text-muted-foreground">
                {JSON.stringify(value, null, 2).slice(0, 100)}
                {JSON.stringify(value).length > 100 && '...'}
              </code>
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

#### 3.2 Pre-Merge Preview (Reuses WorkflowDiffEngine!)

```typescript
// apps/sim/lib/workflows/automerge/preview-service.ts (~40 lines)

export async function previewPull(
  workflowFamilyId: string,
  agentBranchName: string
): Promise<PullPreview> {
  const agentVersion = await getLatestVersion(workflowFamilyId, agentBranchName)
  const mainVersion = await getLatestVersion(workflowFamilyId, 'main')

  const agentState = WorkflowAutomergeService.fromBinary(agentVersion.automergeBinary).toWorkflowState()
  const mainState = WorkflowAutomergeService.fromBinary(mainVersion.automergeBinary).toWorkflowState()

  // REUSE existing WorkflowDiffEngine!
  const diffEngine = new WorkflowDiffEngine()
  const diff = diffEngine.createDiffFromWorkflowState(agentState, mainState)

  return {
    incomingChanges: {
      newBlocks: diff.blocks.filter(b => b.is_diff === 'new'),
      editedBlocks: diff.blocks.filter(b => b.is_diff === 'edited'),
      deletedBlocks: diff.deletedBlocks || [],
      newEdges: diff.edges.filter(e => e.is_diff === 'new'),
    },
    potentialConflicts: identifyPotentialConflicts(agentState, mainState),
  }
}
```

### Phase 4: Version History UI (2-3 days)

#### 4.1 History Panel with Commit Graph

```typescript
// apps/sim/components/version-history/version-history.tsx (~100 lines)
import { CommitGraph } from 'commit-graph'

export function VersionHistory({ workflowFamilyId }: { workflowFamilyId: string }) {
  const { data, fetchNextPage, hasNextPage } = useInfiniteVersions(workflowFamilyId)
  const { data: branches } = useBranches(workflowFamilyId)

  const commits = useMemo(() =>
    data?.pages.flatMap(page => page.versions).map(v => ({
      sha: v.versionHash.slice(0, 7),
      commit: {
        author: { name: v.authorId || 'System', date: v.createdAt },
        message: v.message,
      },
      parents: v.parentVersionId
        ? [{ sha: v.parentVersionId.slice(0, 7) }]
        : [],
    })) || [],
  [data])

  const branchHeads = useMemo(() =>
    branches?.map(b => ({
      name: b.name.replace('agent/', ''),
      commit: { sha: b.headVersionId?.slice(0, 7) || '' },
    })) || [],
  [branches])

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <h3 className="font-semibold">Version History</h3>
      </div>

      <div className="flex-1 overflow-auto">
        <CommitGraph.WithInfiniteScroll
          commits={commits}
          branchHeads={branchHeads}
          onCommitClick={(sha) => handleVersionClick(sha)}
          loadMore={fetchNextPage}
          hasMore={hasNextPage}
          graphStyle={{
            branchColors: ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B'],
            commitSpacing: 50,
            nodeRadius: 4,
          }}
        />
      </div>
    </div>
  )
}
```

---

## Part 6: Code Reuse Summary

### From Libraries (Zero Custom Algorithms)

| Feature | Library | What It Does |
|---------|---------|--------------|
| Version snapshots | Automerge `save()` | Binary export |
| Branching | Automerge `clone()` | Fork document |
| Merge | Automerge `merge()` | Auto-merge with CRDT |
| **Conflict detection** | Automerge `getConflicts()` | Exposes all concurrent values |
| History | Automerge `getHistory()` | Full change log |
| Git visualization | commit-graph | React component |

### From Existing Codebase

| Feature | Location | Reuse Method |
|---------|----------|--------------|
| Diff visualization | `WorkflowDiffEngine` (1,178 lines) | Pre-merge preview |
| Accept/reject pattern | `WorkflowDiffStore` | Conflict resolution flow |
| Block indicators | `block-ring-utils` | Show conflicted blocks |
| Diff UI | `DiffControls` | Adapt for conflict modal |

### New Code Required

| Component | Lines |
|-----------|-------|
| AutomergeService | ~120 |
| ForkService | ~50 |
| MergeService | ~80 |
| PreviewService | ~40 |
| ConflictResolutionModal | ~120 |
| VersionHistory | ~100 |
| DB schema | ~50 |
| API routes | ~100 |
| Hooks | ~60 |
| **Total** | **~720 lines** |

---

## Part 7: Implementation Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1: Automerge Infrastructure | 2-3 days | Service, schema, basic CRUD |
| Phase 2: Fork & Pull | 2 days | Fork to agent, merge from main |
| Phase 3: Conflict Resolution UI | 2-3 days | Detection, modal, resolution |
| Phase 4: Version History | 2-3 days | Commit graph, time travel |
| **Total** | **8-11 days** | **Full feature** |

---

## Part 8: Dependencies

```bash
# Core version control with conflict detection
bun add @automerge/automerge

# Git visualization
bun add commit-graph
```

---

## Part 9: Files to Create/Modify

### New Files (~10 files)

```
apps/sim/lib/workflows/automerge/
├── automerge-service.ts      # Core service (~120 lines)
├── fork-service.ts           # Fork operations (~50 lines)
├── merge-service.ts          # Pull/merge (~80 lines)
├── preview-service.ts        # Pre-merge diff (~40 lines)
├── types.ts                  # Type definitions
└── index.ts                  # Barrel export

apps/sim/components/workflow-conflicts/
├── conflict-resolution-modal.tsx  # Resolution UI (~120 lines)
└── conflict-item.tsx              # Single conflict display

apps/sim/components/version-history/
└── version-history.tsx       # History panel (~100 lines)

apps/sim/hooks/queries/
├── use-workflow-versions.ts  # Version queries
└── use-workflow-branches.ts  # Branch queries
```

### Modified Files (~4 files)

```
packages/db/schema.ts                    # Add tables
packages/db/migrations/                  # Migration
apps/sim/app/.../sidebar/               # Add UI buttons
apps/sim/stores/workflow/store.ts       # Version integration
```

---

## Part 10: Sources & References

### Chosen Solution
- [Automerge Documentation](https://automerge.org/docs/hello/)
- [Automerge Conflicts API](https://automerge.org/docs/reference/documents/conflicts/)
- [Automerge npm](https://www.npmjs.com/package/@automerge/automerge)
- [commit-graph](https://github.com/liuliu-dev/CommitGraph)

### Evaluated But Not Chosen
- [Loro](https://loro.dev/) - No conflict detection API
- [isomorphic-git](https://isomorphic-git.org/) - File-based, not JSON-native
- [trimerge](https://github.com/trimerge/trimerge) - Experimental
- [three-way-merge](https://github.com/movableink/three-way-merge) - Text-focused
- [Yjs](https://github.com/yjs/yjs) - Real-time focus, not versioning

### Platform Research
- [Windmill Git Sync](https://www.windmill.dev/docs/advanced/git_sync) - CLI-based
- [Kestra Git Integration](https://kestra.io/docs/version-control-cicd/git) - YAML GitOps
- [n8n Source Control](https://docs.n8n.io/source-control-environments/) - Environment branches

---

## Conclusion

By using **Automerge** instead of raw Git or other CRDTs:

1. **True conflict detection** - `getConflicts()` shows all concurrent values
2. **User choice** - Let users pick which version to keep
3. **No data loss** - "Losers" are preserved until resolved
4. **JSON-native** - Designed for structured documents, not files
5. **Automatic merge** - Non-conflicting changes merge seamlessly
6. **~720 lines of new code** - 90%+ reuse ratio

**This is a 1.5-2 week project that gives users real version control with meaningful conflict resolution.**
