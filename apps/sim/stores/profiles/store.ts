import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { type AgentProfile, ProfileScope } from '@/lib/profiles/types'
import { initialState, type ProfileActions, type ProfileState } from '@/stores/profiles/types'

export const useProfileStore = create<ProfileState & ProfileActions>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        setProfiles: (profiles) => {
          const profilesRecord = profiles.reduce(
            (acc, profile) => {
              acc[profile.id] = profile
              return acc
            },
            {} as Record<string, AgentProfile>
          )
          set({ profiles: profilesRecord })
        },

        addProfile: (profile) => {
          set((state) => ({
            profiles: {
              ...state.profiles,
              [profile.id]: profile,
            },
          }))
        },

        updateProfile: (profileId, updates) => {
          const { profiles } = get()
          const existingProfile = profiles[profileId]
          if (!existingProfile) return

          set({
            profiles: {
              ...profiles,
              [profileId]: {
                ...existingProfile,
                ...updates,
              },
            },
          })
        },

        removeProfile: (profileId) => {
          const { profiles, activatedProfiles } = get()
          const newProfiles = { ...profiles }
          delete newProfiles[profileId]

          // Also remove from all workspace activations
          const newActivatedProfiles = { ...activatedProfiles }
          for (const workspaceId of Object.keys(newActivatedProfiles)) {
            newActivatedProfiles[workspaceId] = newActivatedProfiles[workspaceId].filter(
              (id) => id !== profileId
            )
          }

          set({
            profiles: newProfiles,
            activatedProfiles: newActivatedProfiles,
          })
        },

        getGlobalProfiles: () => {
          const { profiles } = get()
          return Object.values(profiles).filter((p) => p.scope === ProfileScope.Global)
        },

        getWorkspaceProfiles: (workspaceId) => {
          const { profiles } = get()
          return Object.values(profiles).filter(
            (p) => p.scope === ProfileScope.Workspace && p.workspaceId === workspaceId
          )
        },

        toggleProfile: (workspaceId, profileId) => {
          const { activatedProfiles } = get()
          const currentActivated = activatedProfiles[workspaceId] || []
          const isCurrentlyActivated = currentActivated.includes(profileId)

          const newActivatedProfiles = {
            ...activatedProfiles,
            [workspaceId]: isCurrentlyActivated
              ? currentActivated.filter((id) => id !== profileId)
              : [...currentActivated, profileId],
          }

          set({ activatedProfiles: newActivatedProfiles })
        },

        getActivatedProfiles: (workspaceId) => {
          const { activatedProfiles } = get()
          return activatedProfiles[workspaceId] || []
        },

        isProfileActivated: (workspaceId, profileId) => {
          const { activatedProfiles } = get()
          const workspaceActivations = activatedProfiles[workspaceId] || []
          return workspaceActivations.includes(profileId)
        },

        getWorkspacesWithActivatedProfile: (profileId) => {
          const { activatedProfiles } = get()
          return Object.entries(activatedProfiles)
            .filter(([_, profileIds]) => profileIds.includes(profileId))
            .map(([workspaceId]) => workspaceId)
        },

        setLoading: (isLoading) => set({ isLoading }),

        setError: (error) => set({ error }),

        reset: () => set(initialState),

        setHasHydrated: (hasHydrated) => set({ _hasHydrated: hasHydrated }),
      }),
      {
        name: 'profile-activations',
        onRehydrateStorage: () => (state) => {
          if (state) {
            state.setHasHydrated(true)
          }
        },
        partialize: (state) => ({
          // Only persist activation state - profiles are fetched from API
          activatedProfiles: state.activatedProfiles,
        }),
      }
    ),
    { name: 'ProfileStore' }
  )
)
