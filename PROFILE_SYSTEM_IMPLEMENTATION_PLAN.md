# Profile System Implementation Plan

## Overview

This document outlines the implementation plan for adding a **Profile System** to sim.ai. Profiles allow running workflows for specific agents, where each agent (e.g., Agent A, Agent B) can execute a profile with its own data, independent of others.

### Dual-Scope Architecture

The profile system supports **two scopes**:

| Scope | Label in UI | Description |
|-------|-------------|-------------|
| **Global (User-level)** | "My Profiles" | Personal profiles owned by the user, available across all their workspaces |
| **Workspace-level** | "Workspace Profiles" | Profiles scoped to a specific workspace, potentially shareable with team members |

**Key Principle:** Profiles are *defined* at their scope level, but *activation* is always **per-workspace**. A global profile can be activated in Workspace A but not in Workspace B.

---

## 2. UX/UI Design Decisions

### 2.1 Why Two Scopes?

- **Global (My Profiles):** Your personal browser identities/agents that you reuse across projects. "This is my main scraping agent."
- **Workspace Profiles:** Project-specific profiles, potentially shared with team members. "This is the agent for Client X's project."

### 2.2 Activation Behavior

**Critical Decision:** Activation is always per-workspace context, even for global profiles.

Why? Because workflows run in a workspace context. You might want Profile A active for your e-commerce project but not your social media project.

```
Global Profile "Agent Alpha" defined once
├── Workspace 1: ✓ Activated
├── Workspace 2: ✗ Not activated
└── Workspace 3: ✓ Activated
```

### 2.3 UI Layout: Two Collapsible Sections

```
Profiles                              [↓ import] [↑ export]

▼ My Profiles                                          [+]
   Agent Alpha                              [✓] [✎] [🗑]
   Agent Beta                               [ ] [✎] [🗑]

▼ Workspace Profiles                                   [+]
   Client X Agent                           [✓] [✎] [🗑]
   Project Y Agent                          [ ] [✎] [🗑]
```

### 2.4 Why This Layout Works

1. **Instant clarity** - You always know which scope you're looking at
2. **No extra clicks** - Both sections visible at once, collapsible if unused
3. **Section-specific [+]** - Click [+] on "My Profiles" → creating global. Click [+] on "Workspace Profiles" → creating workspace-scoped. No scope selection step needed in modal.
4. **Collapsible** - If someone only uses global profiles, they collapse the workspace section (or vice versa)

### 2.5 Label Choices

| Technical Term | User-Friendly Label | Rationale |
|---------------|---------------------|-----------|
| Global/User-level | **"My Profiles"** | Personal, yours, everywhere - feels less technical |
| Workspace-level | **"Workspace Profiles"** | Clear it's scoped to current workspace |

### 2.6 Modal Flow

Since each section has its own [+] button, the modal **knows the scope implicitly**:

- Click [+] on "My Profiles" → `scope: 'global'`
- Click [+] on "Workspace Profiles" → `scope: 'workspace'`

**No scope selection step needed in modal.** Same 3 steps:
1. Provider selection (skippable for Own Browser)
2. Name + profile data (TODO)
3. Overview

### 2.7 Edge Cases

| Scenario | Behavior |
|----------|----------|
| Deleting global profile that's activated in workspaces | Warn: "This profile is active in 3 workspaces. Delete anyway?" |
| Team workspace | Workspace profiles visible to team (future). My Profiles always private. |
| Empty section | Show subtle "No profiles yet" with [+] button still visible |
| Same name in both scopes | Allowed - they're different scopes |

---

## 3. Database Schema

### 3.1 New Enums

#### `browser_profile_provider_type` (PostgreSQL Enum)

```typescript
// Location: packages/db/schema.ts
export const browserProfileProviderTypeEnum = pgEnum('browser_profile_provider_type', [
  'own_browser',
  'more_login',
])
```

#### `profile_scope` (PostgreSQL Enum)

```typescript
// Location: packages/db/schema.ts
export const profileScopeEnum = pgEnum('profile_scope', [
  'global',    // User-level, available across all workspaces
  'workspace', // Workspace-level, scoped to specific workspace
])
```

### 3.2 New Tables

#### `browser_profile` Table

```typescript
// Location: packages/db/schema.ts
export const browserProfile = pgTable(
  'browser_profile',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    providerType: browserProfileProviderTypeEnum('provider_type').notNull(),
    providerConfig: jsonb('provider_config').default('{}'), // Provider-specific config
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('browser_profile_user_id_idx').on(table.userId),
    providerTypeIdx: index('browser_profile_provider_type_idx').on(table.providerType),
  })
)
```

#### `agent_profile` Table

```typescript
// Location: packages/db/schema.ts
export const agentProfile = pgTable(
  'agent_profile',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // NULL for global profiles, set for workspace profiles
    workspaceId: text('workspace_id')
      .references(() => workspace.id, { onDelete: 'cascade' }),
    scope: profileScopeEnum('scope').notNull(),
    browserProfileId: text('browser_profile_id')
      .references(() => browserProfile.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    profileData: jsonb('profile_data').default('{}'), // TODO: Future custom profile data
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('agent_profile_user_id_idx').on(table.userId),
    workspaceIdIdx: index('agent_profile_workspace_id_idx').on(table.workspaceId),
    scopeIdx: index('agent_profile_scope_idx').on(table.scope),
    browserProfileIdIdx: index('agent_profile_browser_profile_id_idx').on(table.browserProfileId),
    userScopeIdx: index('agent_profile_user_scope_idx').on(table.userId, table.scope),
    // Constraint: workspace profiles must have workspaceId, global profiles must not
    scopeWorkspaceCheck: check(
      'scope_workspace_check',
      sql`(scope = 'global' AND workspace_id IS NULL) OR (scope = 'workspace' AND workspace_id IS NOT NULL)`
    ),
  })
)
```

### 3.3 Schema Exports

Add exports to `packages/db/schema.ts`:
- `browserProfileProviderTypeEnum`
- `profileScopeEnum`
- `browserProfile`
- `agentProfile`

---

## 4. Services Layer

### 4.1 Profile Service (`apps/sim/lib/profiles/profile-service.ts`)

```typescript
interface ProfileService {
  // CRUD Operations
  createProfile(data: CreateProfileInput): Promise<AgentProfile>
  getProfile(profileId: string): Promise<AgentProfile | null>
  updateProfile(profileId: string, data: UpdateProfileInput): Promise<AgentProfile>
  deleteProfile(profileId: string): Promise<void>

  // Query Operations
  getGlobalProfiles(userId: string): Promise<AgentProfile[]>
  getWorkspaceProfiles(workspaceId: string, userId: string): Promise<AgentProfile[]>
  getAllProfilesForWorkspaceContext(workspaceId: string, userId: string): Promise<{
    globalProfiles: AgentProfile[]
    workspaceProfiles: AgentProfile[]
  }>

  // Activation Management (per-workspace)
  getActivatedProfiles(workspaceId: string): string[]
  toggleProfile(workspaceId: string, profileId: string, activated: boolean): void
  isProfileActivated(workspaceId: string, profileId: string): boolean

  // Deletion checks
  getWorkspacesUsingProfile(profileId: string): string[] // For warning on global profile deletion

  // Provider Configuration
  getConfiguredProviders(): BrowserProfileProvider[]
}
```

### 4.2 Browser Profile Service (`apps/sim/lib/profiles/browser-profile-service.ts`)

```typescript
interface BrowserProfileService {
  // CRUD Operations
  createBrowserProfile(data: CreateBrowserProfileInput): Promise<BrowserProfile>
  getBrowserProfile(browserProfileId: string): Promise<BrowserProfile | null>
  getBrowserProfilesByUser(userId: string): Promise<BrowserProfile[]>
  updateBrowserProfile(browserProfileId: string, data: UpdateBrowserProfileInput): Promise<BrowserProfile>
  deleteBrowserProfile(browserProfileId: string): Promise<void>

  // Link Management
  linkToAgentProfile(browserProfileId: string, agentProfileId: string): Promise<void>
  unlinkFromAgentProfile(agentProfileId: string): Promise<void>
}
```

### 4.3 Types (`apps/sim/lib/profiles/types.ts`)

```typescript
export enum BrowserProfileProvider {
  OwnBrowser = 'own_browser',
  MoreLogin = 'more_login',
}

export enum ProfileScope {
  Global = 'global',
  Workspace = 'workspace',
}

export interface AgentProfile {
  id: string
  userId: string
  workspaceId: string | null // NULL for global profiles
  scope: ProfileScope
  browserProfileId: string | null
  name: string
  profileData: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface BrowserProfile {
  id: string
  userId: string
  providerType: BrowserProfileProvider
  providerConfig: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface CreateProfileInput {
  userId: string
  scope: ProfileScope
  workspaceId?: string // Required if scope is 'workspace'
  name: string
  browserProfileId?: string
  profileData?: Record<string, unknown>
}

export interface UpdateProfileInput {
  name?: string
  browserProfileId?: string
  profileData?: Record<string, unknown>
}

// Activation is stored per-workspace
export interface WorkspaceActivations {
  [workspaceId: string]: string[] // Array of activated profile IDs
}
```

---

## 5. API Routes

### 5.1 Profiles API (`apps/sim/app/api/profiles/route.ts`)

**GET** `/api/profiles?workspaceId={workspaceId}` - List all profiles for workspace context (both global + workspace)
**GET** `/api/profiles?scope=global` - List only global profiles for current user
**GET** `/api/profiles?scope=workspace&workspaceId={workspaceId}` - List only workspace profiles
**POST** `/api/profiles` - Create new profile (body includes `scope` and optionally `workspaceId`)

### 5.2 Profile Detail API (`apps/sim/app/api/profiles/[id]/route.ts`)

**GET** `/api/profiles/{id}` - Get single profile
**PATCH** `/api/profiles/{id}` - Update profile
**DELETE** `/api/profiles/{id}` - Delete profile (returns warning if global profile is activated in workspaces)

### 5.3 Profile Activation API (`apps/sim/app/api/profiles/[id]/activation/route.ts`)

**POST** `/api/profiles/{id}/activation` - Toggle activation for a workspace
```json
{
  "workspaceId": "workspace-123",
  "activated": true
}
```

### 5.4 Browser Profiles API (`apps/sim/app/api/browser-profiles/route.ts`)

**GET** `/api/browser-profiles` - List browser profiles for current user
**POST** `/api/browser-profiles` - Create browser profile

### 5.5 Browser Profile Detail API (`apps/sim/app/api/browser-profiles/[id]/route.ts`)

**GET** `/api/browser-profiles/{id}` - Get browser profile
**PATCH** `/api/browser-profiles/{id}` - Update browser profile
**DELETE** `/api/browser-profiles/{id}` - Delete browser profile

---

## 6. Store (Zustand)

### 6.1 Profile Store (`apps/sim/stores/profiles/store.ts`)

```typescript
interface ProfileState {
  // Profiles by ID
  profiles: Record<string, AgentProfile>

  // Activation state: workspaceId -> Set of activated profileIds
  activatedProfiles: Record<string, Set<string>>

  // Loading states
  isLoading: boolean
  error: string | null
  _hasHydrated: boolean
}

interface ProfileActions {
  // Profile CRUD
  setProfiles: (profiles: AgentProfile[]) => void
  addProfile: (profile: AgentProfile) => void
  updateProfile: (profileId: string, updates: Partial<AgentProfile>) => void
  removeProfile: (profileId: string) => void

  // Computed getters
  getGlobalProfiles: () => AgentProfile[]
  getWorkspaceProfiles: (workspaceId: string) => AgentProfile[]

  // Activation (per-workspace)
  toggleProfile: (workspaceId: string, profileId: string) => void
  getActivatedProfiles: (workspaceId: string) => string[]
  isProfileActivated: (workspaceId: string, profileId: string) => boolean

  // For deletion warning
  getWorkspacesWithActivatedProfile: (profileId: string) => string[]

  // Reset
  clearState: () => void
}
```

**Key Features:**
- Persist `activatedProfiles` to localStorage (keyed by workspaceId)
- Export `useProfileStore` hook
- Activation is always workspace-contextual

### 6.2 Activation Storage Structure

```typescript
// Example state
{
  activatedProfiles: {
    "workspace-1": Set(["profile-a", "profile-c"]),
    "workspace-2": Set(["profile-b"]),
    "workspace-3": Set(["profile-a", "profile-d"]),
  }
}
```

---

## 7. UI Components

### 7.1 Component Structure

```
apps/sim/app/workspace/[workspaceId]/w/components/sidebar/components/
├── profile-section/
│   ├── profile-section.tsx           # Main container with header + both lists
│   ├── components/
│   │   ├── profile-list/
│   │   │   └── profile-list.tsx      # Reusable list component (used for both scopes)
│   │   ├── profile-item/
│   │   │   └── profile-item.tsx      # Individual profile row
│   │   ├── profile-modal/
│   │   │   ├── profile-modal.tsx     # Create/Edit modal
│   │   │   ├── steps/
│   │   │   │   ├── provider-step.tsx # Step 1: Provider selection
│   │   │   │   ├── details-step.tsx  # Step 2: Profile name & data
│   │   │   │   └── overview-step.tsx # Step 3: Confirmation
│   │   │   └── index.ts
│   │   ├── collapsible-section/
│   │   │   └── collapsible-section.tsx # Reusable collapsible wrapper
│   │   └── index.ts
│   └── index.ts
```

### 7.2 ProfileSection Component (Main Container)

**Location:** Above the workflows section in sidebar

```tsx
<ProfileSection workspaceId={workspaceId}>
  {/* Header */}
  <div className="flex items-center justify-between">
    <span>Profiles</span>
    <div>
      <ImportButton />
      <ExportButton />
    </div>
  </div>

  {/* My Profiles (Global) */}
  <CollapsibleSection
    title="My Profiles"
    onAdd={() => openModal('global')}
  >
    <ProfileList profiles={globalProfiles} scope="global" />
  </CollapsibleSection>

  {/* Workspace Profiles */}
  <CollapsibleSection
    title="Workspace Profiles"
    onAdd={() => openModal('workspace')}
  >
    <ProfileList profiles={workspaceProfiles} scope="workspace" />
  </CollapsibleSection>
</ProfileSection>
```

### 7.3 ProfileList Component

**Reusable for both scopes:**

```tsx
interface ProfileListProps {
  profiles: AgentProfile[]
  scope: ProfileScope
  workspaceId: string
  onEdit: (profile: AgentProfile) => void
  onDelete: (profileId: string) => void
}
```

### 7.4 ProfileItem Component

**Features:**
- Profile name display
- Edit icon button (pencil) - Opens modal in edit mode
- Trash icon button - Deletes profile with confirmation
  - For global profiles: Shows warning if activated in other workspaces
- Toggle button (activate/deactivate)
  - **IMPORTANT:** Disabled when workflow is executing (`useExecutionStore.isExecuting`)
  - State controlled by `activatedProfiles[workspaceId]`

### 7.5 ProfileModal Component (Multi-Step)

**Props:**
```tsx
interface ProfileModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scope: ProfileScope // Passed from which [+] button was clicked
  workspaceId: string
  editingProfile?: AgentProfile // If editing existing profile
}
```

**Step 1: Provider Selection**
- Radio/card selection for browser profile provider
- Options from `BrowserProfileProvider` enum:
  - Own Browser (can be skipped)
  - MoreLogin
- Skip button for "Own Browser" option

**Step 2: Profile Details**
- Name input field (default: `agent_${index}`)
- Profile data section (TODO: "Coming soon" placeholder)
- Basic validation

**Step 3: Overview & Confirmation**
- Summary of selected provider
- Summary of profile name
- **Shows scope:** "This profile will be available in: All workspaces / This workspace only"
- Confirm button to save
- Back button to edit

**Edit Mode:**
- Same modal with pre-filled data
- Scope is displayed but NOT editable (cannot change global to workspace or vice versa)

### 7.6 CollapsibleSection Component

**Reusable collapsible wrapper:**

```tsx
interface CollapsibleSectionProps {
  title: string
  defaultExpanded?: boolean
  onAdd: () => void
  addDisabled?: boolean
  children: React.ReactNode
}
```

Features:
- Expand/collapse toggle (▼/▶)
- Section title
- [+] button for adding new item
- Remembers expanded state in localStorage

---

## 8. Hooks

### 8.1 Profile Hooks (`apps/sim/app/workspace/[workspaceId]/w/components/sidebar/hooks/`)

```typescript
// use-profile-operations.ts
interface UseProfileOperationsProps {
  workspaceId: string
}

interface UseProfileOperationsReturn {
  // Data
  globalProfiles: AgentProfile[]
  workspaceProfiles: AgentProfile[]
  isLoading: boolean
  error: string | null

  // CRUD
  createProfile: (data: CreateProfileInput) => Promise<AgentProfile>
  updateProfile: (profileId: string, data: UpdateProfileInput) => Promise<AgentProfile>
  deleteProfile: (profileId: string) => Promise<void>

  // Activation
  toggleProfileActivation: (profileId: string) => void
  isProfileActivated: (profileId: string) => boolean

  // Loading states
  isCreatingProfile: boolean
  isDeletingProfile: boolean
}
```

### 8.2 React Query Integration (`apps/sim/hooks/queries/profiles.ts`)

```typescript
export const profileKeys = {
  all: ['profiles'] as const,
  lists: () => [...profileKeys.all, 'list'] as const,
  listByWorkspace: (workspaceId: string) => [...profileKeys.lists(), 'workspace', workspaceId] as const,
  listGlobal: () => [...profileKeys.lists(), 'global'] as const,
  details: () => [...profileKeys.all, 'detail'] as const,
  detail: (id: string) => [...profileKeys.details(), id] as const,
}

// Fetches both global and workspace profiles for a workspace context
export function useProfilesForWorkspace(workspaceId: string) { /* ... */ }

// Individual queries
export function useGlobalProfiles() { /* ... */ }
export function useWorkspaceProfiles(workspaceId: string) { /* ... */ }
export function useProfile(profileId: string) { /* ... */ }

// Mutations
export function useCreateProfile() { /* ... */ }
export function useUpdateProfile() { /* ... */ }
export function useDeleteProfile() { /* ... */ }
```

---

## 9. Integration Points

### 9.1 Sidebar Integration

**File:** `apps/sim/app/workspace/[workspaceId]/w/components/sidebar/sidebar.tsx`

Add `ProfileSection` component above the workflows section:

```tsx
{/* Profile Section - NEW */}
<ProfileSection workspaceId={workspaceId} />

{/* Workflows Section - EXISTING */}
<div className='workflows-section relative mt-[14px] flex flex-1 flex-col overflow-hidden'>
  {/* ... existing workflow list ... */}
</div>
```

### 9.2 Component Index Update

**File:** `apps/sim/app/workspace/[workspaceId]/w/components/sidebar/components/index.ts`

```typescript
export { ProfileSection } from './profile-section/profile-section'
```

### 9.3 Execution State Integration

Use `useExecutionStore` to disable profile toggle when workflow is running:

```typescript
const isExecuting = useExecutionStore((state) => state.isExecuting)

// In ProfileItem
<ToggleButton disabled={isExecuting} />
```

---

## 10. Validation (Zod Schemas)

### 10.1 Create Profile Schema

```typescript
const CreateProfileSchema = z.object({
  scope: z.enum(['global', 'workspace']),
  workspaceId: z.string().optional(),
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters'),
  browserProfileId: z.string().optional(),
  profileData: z.record(z.unknown()).optional(),
}).refine(
  (data) => {
    if (data.scope === 'workspace' && !data.workspaceId) {
      return false
    }
    if (data.scope === 'global' && data.workspaceId) {
      return false
    }
    return true
  },
  {
    message: 'Workspace profiles require workspaceId, global profiles must not have workspaceId',
  }
)
```

### 10.2 Update Profile Schema

```typescript
const UpdateProfileSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters')
    .optional(),
  browserProfileId: z.string().nullable().optional(),
  profileData: z.record(z.unknown()).optional(),
})
// Note: scope cannot be changed after creation
```

### 10.3 Activation Schema

```typescript
const ActivationSchema = z.object({
  workspaceId: z.string().min(1, 'Workspace ID is required'),
  activated: z.boolean(),
})
```

---

## 11. File Structure Summary

```
packages/db/
├── schema.ts                          # Add enums + tables

apps/sim/
├── lib/
│   └── profiles/
│       ├── index.ts
│       ├── types.ts                   # Enums, interfaces (ProfileScope, etc.)
│       ├── profile-service.ts         # Profile CRUD + activation
│       └── browser-profile-service.ts # Browser profile CRUD
├── app/
│   └── api/
│       ├── profiles/
│       │   ├── route.ts               # GET list (with scope filter), POST create
│       │   └── [id]/
│       │       ├── route.ts           # GET, PATCH, DELETE
│       │       └── activation/
│       │           └── route.ts       # POST toggle activation
│       └── browser-profiles/
│           ├── route.ts               # GET list, POST create
│           └── [id]/
│               └── route.ts           # GET, PATCH, DELETE
├── stores/
│   └── profiles/
│       ├── store.ts                   # Zustand store with per-workspace activation
│       └── types.ts                   # Store types
├── hooks/
│   └── queries/
│       └── profiles.ts                # React Query hooks
└── app/workspace/[workspaceId]/w/components/sidebar/
    ├── components/
    │   ├── profile-section/
    │   │   ├── profile-section.tsx    # Main container
    │   │   ├── components/
    │   │   │   ├── profile-list/
    │   │   │   │   └── profile-list.tsx
    │   │   │   ├── profile-item/
    │   │   │   │   └── profile-item.tsx
    │   │   │   ├── profile-modal/
    │   │   │   │   ├── profile-modal.tsx
    │   │   │   │   └── steps/
    │   │   │   │       ├── provider-step.tsx
    │   │   │   │       ├── details-step.tsx
    │   │   │   │       └── overview-step.tsx
    │   │   │   ├── collapsible-section/
    │   │   │   │   └── collapsible-section.tsx
    │   │   │   └── index.ts
    │   │   └── index.ts
    │   └── index.ts                   # Add ProfileSection export
    ├── hooks/
    │   └── use-profile-operations.ts  # Profile operations hook
    └── sidebar.tsx                    # Add ProfileSection integration
```

---

## 12. Implementation Order

### Phase 1: Database & Types
1. Add enums (`profileScopeEnum`, `browserProfileProviderTypeEnum`) to `packages/db/schema.ts`
2. Add tables (`browserProfile`, `agentProfile`) with scope check constraint
3. Run database migration: `bunx drizzle-kit generate && bunx drizzle-kit migrate`
4. Create type definitions in `apps/sim/lib/profiles/types.ts`

### Phase 2: Services
5. Implement `profile-service.ts` with dual-scope support
6. Implement `browser-profile-service.ts`

### Phase 3: API Routes
7. Create `/api/profiles` routes with scope filtering
8. Create `/api/profiles/[id]/activation` route
9. Create `/api/browser-profiles` routes

### Phase 4: State Management
10. Create Zustand store with per-workspace activation
11. Create React Query hooks

### Phase 5: UI Components
12. Create `CollapsibleSection` component
13. Create `ProfileList` component (reusable)
14. Create `ProfileItem` component
15. Create `ProfileModal` with steps
16. Create `ProfileSection` container

### Phase 6: Integration
17. Integrate `ProfileSection` into Sidebar
18. Update component exports
19. Test full flow (both scopes, activation, deletion warnings)

---

## 13. Key Patterns to Follow

Based on the codebase analysis:

1. **Logging:** Use `createLogger('@sim/logger')` instead of `console.log`
2. **Imports:** Use `@/components/emcn` for UI components, never subpaths
3. **Forms:** Use `react-hook-form` with `zodResolver`
4. **API:** Use Zod validation, proper error codes, `NextResponse.json()`
5. **Auth:** Check session with `getSession()` from `@/lib/auth`
6. **Database:** Use Drizzle ORM patterns, proper indexes, check constraints
7. **Stores:** Use Zustand with `devtools` middleware
8. **Components:** Follow structure order (refs, hooks, state, effects, handlers, JSX)
9. **Styling:** Tailwind only, no inline styles, use `cn()` for conditional classes
10. **TypeScript:** Proper interfaces, no `any`, typed callbacks

---

## 14. Notes & Considerations

### 14.1 DRY Principle
- `ProfileList` component is reused for both global and workspace profiles
- `CollapsibleSection` is a generic reusable component
- Reuse existing modal patterns from `CreateBaseModal`
- Reuse existing item patterns from `WorkflowItem`

### 14.2 Future Enhancements (TODO)
- Step 2 profile data: Custom JSON form builder
- Step 2 profile data: Database storage option
- Step 2 profile data: AI-generated profile data
- Import/export profile functionality (per-section or all)
- Team sharing for workspace profiles

### 14.3 Security
- Global profiles: Only visible to owner (`userId`)
- Workspace profiles: Scoped to `userId` AND `workspaceId`
- User A cannot see User B's profiles (either scope)
- Validate ownership in all API routes
- Activation state is user-specific (stored client-side per workspace)

### 14.4 Data Integrity
- Database constraint ensures global profiles have NULL workspaceId
- Database constraint ensures workspace profiles have non-NULL workspaceId
- Deleting a workspace cascades to delete its workspace-scoped profiles
- Deleting a user cascades to delete all their profiles (both scopes)

---

## 15. Dependencies

No new npm packages required. Uses existing:
- `zustand` - State management
- `@tanstack/react-query` - Server state
- `react-hook-form` + `@hookform/resolvers` - Forms
- `zod` - Validation
- `lucide-react` - Icons
- `drizzle-orm` - Database ORM

---

## 16. Detailed Implementation Checklist

### Phase 1: Database & Types ✅

#### 1.1 Add browserProfileProviderTypeEnum
- [x] Open `packages/db/schema.ts`
- [x] Add enum definition after existing enums:
  ```typescript
  export const browserProfileProviderTypeEnum = pgEnum('browser_profile_provider_type', [
    'own_browser',
    'more_login',
  ])
  ```
- [x] Verify no naming conflicts with existing enums

#### 1.2 Add profileScopeEnum
- [x] Add enum definition:
  ```typescript
  export const profileScopeEnum = pgEnum('profile_scope', [
    'global',
    'workspace',
  ])
  ```

#### 1.3 Add browserProfile table
- [x] Add table definition with columns: id, userId, providerType, providerConfig, createdAt, updatedAt
- [x] Add foreign key reference to user table with cascade delete
- [x] Add indexes: userIdIdx, providerTypeIdx

#### 1.4 Add agentProfile table
- [x] Add table definition with columns: id, userId, workspaceId (nullable), scope, browserProfileId, name, profileData, createdAt, updatedAt
- [x] Add foreign key references: user (cascade), workspace (cascade), browserProfile (set null)
- [x] Add indexes: userIdIdx, workspaceIdIdx, scopeIdx, browserProfileIdIdx, userScopeIdx
- [x] Add check constraint for scope/workspaceId consistency:
  ```sql
  (scope = 'global' AND workspace_id IS NULL) OR (scope = 'workspace' AND workspace_id IS NOT NULL)
  ```

#### 1.5 Run database migration
- [x] Run `bunx drizzle-kit generate` to create migration files
- [x] Review generated migration SQL
- [x] Run `bunx drizzle-kit migrate` to apply migration
- [x] Verify tables created in database

#### 1.6 Create TypeScript types
- [x] Create `apps/sim/lib/profiles/types.ts`
- [x] Add `BrowserProfileProvider` enum
- [x] Add `ProfileScope` enum
- [x] Add `AgentProfile` interface
- [x] Add `BrowserProfile` interface
- [x] Add `CreateProfileInput` interface
- [x] Add `UpdateProfileInput` interface
- [x] Add `WorkspaceActivations` interface

---

### Phase 2: Services Layer ✅

#### 2.1 Create profile-service.ts
- [x] Create `apps/sim/lib/profiles/profile-service.ts`
- [x] Import db, schema, and types
- [x] Implement `createProfile()` - validates scope/workspaceId, generates ID, inserts record
- [x] Implement `getProfileById()` - fetches by ID (fail-fast approach)
- [x] Implement `updateProfile()` - partial update with fail-fast existence check
- [x] Implement `deleteProfile()` - deletes with fail-fast existence check
- [x] Implement `getProfiles()` - fetches all profiles for user with optional workspace filter
- [x] Implement `getProfilesByScope()` - fetches profiles by scope
- [x] Implement `getProfileWithBrowserProfile()` - fetches profile with joined browser profile
- [x] Add proper error handling and logging

#### 2.2 Create browser-profile-service.ts
- [x] Create `apps/sim/lib/profiles/browser-profile-service.ts`
- [x] Implement `createBrowserProfile()` - creates with userId
- [x] Implement `getBrowserProfileById()` - fetches by ID (fail-fast approach)
- [x] Implement `getBrowserProfiles()` - fetches all for user
- [x] Implement `getBrowserProfilesByProvider()` - fetches by provider type
- [x] Implement `updateBrowserProfile()` - partial update with fail-fast existence check
- [x] Implement `deleteBrowserProfile()` - deletes with fail-fast existence check

#### 2.3 Create index.ts barrel export
- [x] Create `apps/sim/lib/profiles/index.ts`
- [x] Export all types from types.ts
- [x] Export profile service functions
- [x] Export browser profile service functions

---

### Phase 3: API Routes ✅

#### 3.1 Create /api/profiles/route.ts
- [x] Create `apps/sim/app/api/profiles/route.ts`
- [x] Add GET handler:
  - [x] Get session, validate auth
  - [x] Parse query params: workspaceId, scope
  - [x] If workspaceId provided: return both global + workspace profiles
  - [x] If scope=global: return only global profiles
  - [x] If scope=workspace + workspaceId: return only workspace profiles
  - [x] Return JSON response with profiles array
- [x] Add POST handler:
  - [x] Get session, validate auth
  - [x] Parse and validate body with Zod schema (with .refine() for scope/workspaceId)
  - [x] Auto-create browser profile (defaults to own_browser)
  - [x] Call profileService.createProfile() with browser profile linked
  - [x] Rollback browser profile if agent profile creation fails
  - [x] Return created profile with browser profile

#### 3.2 Create /api/profiles/[id]/route.ts
- [x] Create `apps/sim/app/api/profiles/[id]/route.ts`
- [x] Add GET handler:
  - [x] Extract id from params
  - [x] Validate auth
  - [x] Return profile (with browser profile if exists)
- [x] Add PATCH handler:
  - [x] Extract id from params
  - [x] Validate auth and existence
  - [x] Parse and validate body (name, browserProfileId, profileData)
  - [x] Call profileService.updateProfile()
  - [x] Return updated profile
- [x] Add DELETE handler:
  - [x] Extract id from params
  - [x] Validate auth and existence
  - [x] Call profileService.deleteProfile()
  - [x] Return success

#### 3.3 Create /api/profiles/[id]/activation/route.ts
- [ ] Create `apps/sim/app/api/profiles/[id]/activation/route.ts` (TODO: Activation managed client-side for now)

#### 3.4 Create /api/browser-profiles/route.ts
- [x] Create `apps/sim/app/api/browser-profiles/route.ts`
- [x] Add GET handler - list all for current user (with optional providerType filter)
- [x] Add POST handler - create new browser profile

#### 3.5 Create /api/browser-profiles/[id]/route.ts
- [x] Create `apps/sim/app/api/browser-profiles/[id]/route.ts`
- [x] Add GET handler
- [x] Add PATCH handler
- [x] Add DELETE handler

---

### Phase 4: State Management ✅

#### 4.1 Create store types
- [x] Create `apps/sim/stores/profiles/types.ts`
- [x] Define `ProfileState` interface
- [x] Define `ProfileActions` interface
- [x] Export combined store type

#### 4.2 Create Zustand store
- [x] Create `apps/sim/stores/profiles/store.ts`
- [x] Import create, devtools, persist from zustand
- [x] Define initial state
- [x] Implement `setProfiles()` - converts array to Record
- [x] Implement `addProfile()` - adds single profile
- [x] Implement `updateProfile()` - updates profile by ID (fail-fast: checks existence)
- [x] Implement `removeProfile()` - removes profile by ID (also cleans activations)
- [x] Implement `getGlobalProfiles()` - filters by scope
- [x] Implement `getWorkspaceProfiles()` - filters by workspaceId
- [x] Implement `toggleProfile()` - toggles activation for workspace
- [x] Implement `getActivatedProfiles()` - returns activated IDs for workspace
- [x] Implement `isProfileActivated()` - checks if profile activated in workspace
- [x] Implement `getWorkspacesWithActivatedProfile()` - for deletion warning
- [x] Implement `reset()` - resets to initial (renamed from clearState for consistency)
- [x] Add persist middleware for activatedProfiles only (YAGNI: profiles come from API)
- [x] Add devtools middleware with name

#### 4.3 Export from stores/index.ts
- [x] Add export for useProfileStore
- [x] Integrate with resetAllStores and logAllStores

#### 4.4 Create React Query hooks
- [x] Create `apps/sim/hooks/queries/profiles.ts`
- [x] Define profileKeys factory
- [x] Implement `useProfilesForWorkspace()` - fetches both scopes, syncs to store
- [x] Implement `useGlobalProfiles()` - fetches global only
- [x] Implement `useProfile()` - fetches single profile
- [x] Implement `useCreateProfile()` mutation
- [x] Implement `useUpdateProfile()` mutation
- [x] Implement `useDeleteProfile()` mutation
- [x] Add proper cache invalidation in mutations
- [x] Note: `useWorkspaceProfiles()` not needed - `useProfilesForWorkspace` handles both (YAGNI)

---

### Phase 5: UI Components ✅

#### 5.1 Create CollapsibleSection component
- [x] Create `apps/sim/app/workspace/[workspaceId]/w/components/sidebar/components/profile-section/components/collapsible-section/collapsible-section.tsx`
- [x] Props: title, storageKey, defaultExpanded, onAdd, addDisabled, addTooltip, children
- [x] State: isExpanded (persisted to localStorage by storageKey)
- [x] Render expand/collapse chevron icon (ChevronDown/ChevronRight)
- [x] Render title
- [x] Render [+] button with onClick={onAdd} and tooltip
- [x] Conditionally render children based on isExpanded
- [x] Handle hydration to prevent SSR mismatch (KISS)

#### 5.2 Create ProfileItem component
- [x] Create `apps/sim/app/workspace/[workspaceId]/w/components/sidebar/components/profile-section/components/profile-item/profile-item.tsx`
- [x] Props: profile, isActivated, isExecuting, onToggle, onEdit, onDelete
- [x] Render profile name (truncated with CSS)
- [x] Render toggle button:
  - [x] Checkbox-style with Check icon when activated
  - [x] Disabled when isExecuting is true
  - [x] Tooltip explains state
- [x] Render edit button (Pencil icon) - visible on hover
- [x] Render delete button (Trash icon) - visible on hover
- [x] Style hover states with group/group-hover

#### 5.3 Create ProfileList component
- [x] Create `apps/sim/app/workspace/[workspaceId]/w/components/sidebar/components/profile-section/components/profile-list/profile-list.tsx`
- [x] Props: profiles, workspaceId, isExecuting, onEdit, onDelete
- [x] Get activation state from useProfileStore
- [x] Map profiles to ProfileItem components
- [x] Show empty state if no profiles: "No profiles yet"
- [x] Note: isExecuting passed from parent (KISS - single source of truth)

#### 5.4 Create provider-step.tsx (Step 1)
- [x] Create `apps/sim/app/workspace/[workspaceId]/w/components/sidebar/components/profile-section/components/profile-modal/steps/provider-step.tsx`
- [x] Props: selectedProvider, onSelect, onNext, onSkip
- [x] Render card options for each BrowserProfileProvider
- [x] "Own Browser" card with icon
- [x] "MoreLogin" card with icon
- [x] Skip button that auto-selects "Own Browser"
- [x] Next button (disabled if no selection)

#### 5.5 Create details-step.tsx (Step 2)
- [x] Create `apps/sim/app/workspace/[workspaceId]/w/components/sidebar/components/profile-section/components/profile-modal/steps/details-step.tsx`
- [x] Props: name, onNameChange, onNext, onBack, errors
- [x] Render name input with validation and maxLength
- [x] Render "Profile Data" section with "Coming soon" placeholder
- [x] Enter key navigates to next step
- [x] Back button
- [x] Next button (disabled if name empty)

#### 5.6 Create overview-step.tsx (Step 3)
- [x] Create `apps/sim/app/workspace/[workspaceId]/w/components/sidebar/components/profile-section/components/profile-modal/steps/overview-step.tsx`
- [x] Props: provider, name, scope, onBack, onConfirm, isSubmitting
- [x] Render summary:
  - [x] Provider: Own Browser / MoreLogin with icon
  - [x] Name: {name}
  - [x] Availability: "All workspaces" / "This workspace only"
- [x] Back button (disabled when submitting)
- [x] Confirm button (shows Loader2 spinner when isSubmitting)

#### 5.7 Create ProfileModal component
- [x] Create `apps/sim/app/workspace/[workspaceId]/w/components/sidebar/components/profile-section/components/profile-modal/profile-modal.tsx`
- [x] Props: open, onOpenChange, scope, workspaceId, editingProfile?
- [x] State: currentStep ('provider', 'details', 'overview'), selectedProvider, profileName
- [x] Reset form when modal opens/closes via useEffect
- [x] Pre-fill form if editingProfile provided (skips provider step)
- [x] Render Dialog with DialogContent, DialogHeader, DialogTitle
- [x] Conditionally render step component based on currentStep
- [x] Handle step navigation with callbacks
- [x] On confirm: call createProfile or updateProfile mutation
- [x] Close modal on success
- [x] Note: Uses useState instead of react-hook-form (KISS - simpler for this flow)

#### 5.8 Create ProfileSection container
- [x] Create `apps/sim/app/workspace/[workspaceId]/w/components/sidebar/components/profile-section/profile-section.tsx`
- [x] Props: workspaceId
- [x] Fetch profiles using useProfilesForWorkspace hook
- [x] State: isModalOpen, modalScope, editingProfile
- [x] Render header:
  - [x] "Profiles" label
  - [x] Import button (disabled with "coming soon" tooltip)
  - [x] Export button (disabled with "coming soon" tooltip)
- [x] Render "My Profiles" CollapsibleSection:
  - [x] onAdd opens modal with scope='global'
  - [x] ProfileList with global profiles
- [x] Render "Workspace Profiles" CollapsibleSection:
  - [x] onAdd opens modal with scope='workspace'
  - [x] ProfileList with workspace profiles
- [x] Render ProfileModal
- [x] Delete confirmation with warning for global profiles activated elsewhere
- [x] Uses useExecutionStore to check if workflow is running

#### 5.9 Create use-profile-operations hook
- [x] **SKIPPED (YAGNI)** - Functionality integrated directly into ProfileSection
- [x] ProfileSection uses React Query hooks and Zustand store directly
- [x] No intermediate abstraction layer needed - follows KISS principle
- [x] All required functionality implemented inline:
  - [x] globalProfiles, workspaceProfiles via store selectors
  - [x] isLoading from useProfilesForWorkspace
  - [x] delete via useDeleteProfile mutation
  - [x] create/update via ProfileModal using mutations

#### 5.10 Create component index files
- [x] Create `profile-section/components/index.ts`
- [x] Create `profile-section/components/profile-item/index.ts`
- [x] Create `profile-section/components/profile-list/index.ts`
- [x] Create `profile-section/components/profile-modal/index.ts`
- [x] Create `profile-section/components/profile-modal/steps/index.ts`
- [x] Create `profile-section/components/collapsible-section/index.ts`
- [x] Create `profile-section/index.ts`
- [x] Note: `profile-section/hooks/index.ts` not created (5.9 skipped per YAGNI)

---

### Phase 6: Integration & Testing

#### 6.1 Integrate into sidebar
- [x] Open `apps/sim/app/workspace/[workspaceId]/w/components/sidebar/sidebar.tsx`
- [x] Import ProfileSection from components
- [x] Add ProfileSection above workflows section (in mt-[14px] px-[14px] container)
- [x] Pass workspaceId prop

#### 6.2 Update component exports
- [x] Open `apps/sim/app/workspace/[workspaceId]/w/components/sidebar/components/index.ts`
- [x] Add export for ProfileSection

#### 6.3 Test: Create global profile
- [ ] Open sidebar in workspace
- [ ] Click [+] on "My Profiles" section
- [ ] Complete 3-step wizard
- [ ] Verify profile appears in "My Profiles"
- [ ] Switch workspace, verify profile still visible in "My Profiles"

#### 6.4 Test: Create workspace profile
- [ ] Click [+] on "Workspace Profiles" section
- [ ] Complete 3-step wizard
- [ ] Verify profile appears in "Workspace Profiles"
- [ ] Switch workspace, verify profile NOT visible

#### 6.5 Test: Edit profile
- [ ] Click edit icon on existing profile
- [ ] Modal opens with pre-filled data
- [ ] Change name
- [ ] Confirm
- [ ] Verify name updated in list

#### 6.6 Test: Delete profile
- [ ] Delete a workspace profile - should delete immediately
- [ ] Delete a global profile that's activated in multiple workspaces:
  - [ ] Should show warning with workspace count
  - [ ] Confirm deletion
  - [ ] Verify deleted

#### 6.7 Test: Activation toggle
- [ ] Toggle a profile to activated
- [ ] Verify visual indicator
- [ ] Switch to another workspace
- [ ] Verify same profile shows as NOT activated
- [ ] Toggle to activate in second workspace
- [ ] Switch back to first workspace
- [ ] Verify still activated

#### 6.8 Test: Toggle disabled during execution
- [ ] Run a workflow
- [ ] While running, verify toggle button is disabled
- [ ] Cannot toggle profiles during execution
- [ ] After execution completes, toggle re-enabled

---

### Phase 7: Polish & Edge Cases (Optional)

#### 7.1 Loading states
- [ ] Show skeleton while profiles loading
- [ ] Show spinner on buttons during mutations

#### 7.2 Error handling
- [ ] Show toast/alert on API errors
- [ ] Handle network failures gracefully

#### 7.3 Empty states
- [ ] Style "No profiles yet" message
- [ ] Add subtle prompt to create first profile

#### 7.4 Animations
- [ ] Smooth collapse/expand animation for sections
- [ ] Fade in new profiles

#### 7.5 Keyboard navigation
- [ ] Tab through profile items
- [ ] Enter to toggle/edit
- [ ] Escape to close modal
