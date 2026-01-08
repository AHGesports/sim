/**
 * Neon API client singleton.
 * Lazily initialized on first use.
 */

import { createApiClient, type Api } from '@neondatabase/api-client'

let apiClient: Api<unknown> | null = null

/**
 * Get the Neon API client instance.
 * @throws Error if NEON_API_KEY is not set
 */
export function getApiClient(): Api<unknown> {
  if (!apiClient) {
    const apiKey = process.env.NEON_API_KEY
    if (!apiKey) {
      throw new Error('NEON_API_KEY environment variable is not set')
    }
    apiClient = createApiClient({ apiKey })
  }
  return apiClient
}
