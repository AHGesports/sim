/**
 * Retry utilities with exponential backoff.
 */

import { createLogger } from '@sim/logger'

import { sanitizeError } from './sanitize'

const logger = createLogger('neon-retry')

/**
 * Configuration for retry behavior.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay?: number
  /** Maximum delay in milliseconds (default: 10000) */
  maxDelay?: number
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number
  /** Whether to retry on this error (default: true for 5xx, false otherwise) */
  shouldRetry?: (error: unknown, attempt: number) => boolean
}

/**
 * Default retry configuration.
 */
const DEFAULT_CONFIG: Required<RetryConfig> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  shouldRetry: (error: unknown) => {
    // Only retry on 5xx server errors or network errors
    if (error && typeof error === 'object' && 'status' in error) {
      const status = (error as { status: number }).status
      return status >= 500 && status < 600
    }
    // Retry on network errors
    if (error instanceof Error) {
      return error.message.includes('ECONNREFUSED') ||
             error.message.includes('ETIMEDOUT') ||
             error.message.includes('ENOTFOUND')
    }
    return false
  },
}

/**
 * Calculate delay with exponential backoff and jitter.
 * @param attempt - Current attempt number (0-indexed)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
function calculateDelay(attempt: number, config: Required<RetryConfig>): number {
  const exponentialDelay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt)
  const cappedDelay = Math.min(exponentialDelay, config.maxDelay)

  // Add jitter (±25% random variation)
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1)

  return Math.floor(cappedDelay + jitter)
}

/**
 * Sleep for the specified duration.
 * @param ms - Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Retry an async operation with exponential backoff.
 * @param operation - Async function to retry
 * @param config - Retry configuration
 * @returns Result of the operation
 * @throws Last error if all retries fail
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config }
  let lastError: unknown

  for (let attempt = 0; attempt < finalConfig.maxAttempts; attempt++) {
    try {
      const result = await operation()

      if (attempt > 0) {
        logger.info('Operation succeeded after retry', { attempt: attempt + 1 })
      }

      return result
    } catch (error) {
      lastError = error

      const isLastAttempt = attempt === finalConfig.maxAttempts - 1
      const shouldRetry = finalConfig.shouldRetry(error, attempt)

      if (isLastAttempt || !shouldRetry) {
        logger.error('Operation failed', {
          attempt: attempt + 1,
          maxAttempts: finalConfig.maxAttempts,
          willRetry: false,
          error: sanitizeError(error),
        })
        throw error
      }

      const delay = calculateDelay(attempt, finalConfig)

      logger.warn('Operation failed, will retry', {
        attempt: attempt + 1,
        maxAttempts: finalConfig.maxAttempts,
        delayMs: delay,
        error: sanitizeError(error),
      })

      await sleep(delay)
    }
  }

  // This should never happen, but TypeScript requires it
  throw lastError
}
