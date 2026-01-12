/**
 * Custom error classes for Neon operations.
 */

/**
 * Base error for all Neon-related errors.
 */
export class NeonError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'NeonError'
  }
}

/**
 * Error thrown when Neon project creation fails due to precondition failure (412).
 * This typically indicates account limitations or unsupported configurations.
 */
export class NeonProjectLimitError extends NeonError {
  constructor(cause?: unknown) {
    const message = [
      'Failed to create Neon project: Precondition Failed (412)',
      '',
      'Common causes:',
      '  • Trying to set suspend_timeout_seconds on free tier (not allowed)',
      '  • Project limit reached (Free tier: 100 projects max)',
      '  • Billing/payment method required for certain configurations',
      '  • API key missing project creation permissions',
      '',
      'Solutions:',
      '  1. Remove suspend_timeout_seconds from config (free tier uses Neon default)',
      '  2. Check project count: https://console.neon.tech/app/projects',
      '  3. Verify API key permissions: https://console.neon.tech/app/settings/api-keys',
      '  4. Upgrade to paid plan for advanced compute settings',
    ].join('\n')

    super(message, cause)
    this.name = 'NeonProjectLimitError'
  }
}

/**
 * Error thrown when Neon API authentication fails.
 */
export class NeonAuthError extends NeonError {
  constructor(cause?: unknown) {
    const message = [
      'Failed to authenticate with Neon API',
      '',
      'Solutions:',
      '  1. Verify NEON_API_KEY environment variable is set',
      '  2. Check API key is valid at https://console.neon.tech/app/settings/api-keys',
      '  3. Ensure API key has not been revoked',
    ].join('\n')

    super(message, cause)
    this.name = 'NeonAuthError'
  }
}

/**
 * Error thrown when Neon API rate limit is exceeded.
 */
export class NeonRateLimitError extends NeonError {
  constructor(
    public readonly retryAfter?: number,
    cause?: unknown
  ) {
    const message = retryAfter
      ? `Neon API rate limit exceeded. Retry after ${retryAfter} seconds.`
      : 'Neon API rate limit exceeded. Please try again later.'

    super(message, cause)
    this.name = 'NeonRateLimitError'
  }
}

/**
 * Error thrown when Neon API returns a server error (5xx).
 */
export class NeonServerError extends NeonError {
  constructor(
    public readonly status: number,
    cause?: unknown
  ) {
    super(`Neon API server error (${status}). This is likely a temporary issue.`, cause)
    this.name = 'NeonServerError'
  }
}

/**
 * Parse axios error and throw appropriate custom error.
 * @param error - The caught error
 * @param operation - Description of the operation that failed
 * @throws Specific NeonError subclass based on error type
 */
export function handleNeonError(error: unknown, operation: string): never {
  if (!error || typeof error !== 'object') {
    throw new NeonError(`${operation} failed: ${String(error)}`, error)
  }

  const err = error as { status?: number; response?: { status?: number; headers?: Record<string, string> } }
  const status = err.status ?? err.response?.status

  if (!status) {
    throw new NeonError(`${operation} failed: ${error instanceof Error ? error.message : String(error)}`, error)
  }

  switch (status) {
    case 401:
    case 403:
      throw new NeonAuthError(error)

    case 412:
      throw new NeonProjectLimitError(error)

    case 429: {
      const retryAfter = err.response?.headers?.['retry-after']
      const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : undefined
      throw new NeonRateLimitError(retrySeconds, error)
    }

    default:
      if (status >= 500) {
        throw new NeonServerError(status, error)
      }
      throw new NeonError(
        `${operation} failed with status ${status}`,
        error
      )
  }
}
