/**
 * Log sanitization utilities to prevent sensitive data exposure.
 */

/**
 * Patterns for sensitive data that should be redacted from logs.
 */
const SENSITIVE_PATTERNS = [
  // API keys and tokens
  /napi_[a-zA-Z0-9_]+/gi,
  /Bearer\s+[a-zA-Z0-9_\-\.]+/gi,

  // Database connection strings
  /postgresql:\/\/[^@]+@[^\s]+/gi,
  /postgres:\/\/[^@]+@[^\s]+/gi,

  // Generic secrets
  /['"](secret|password|apiKey|api_key|token)['"]\s*:\s*['"][^'"]+['"]/gi,
] as const

/**
 * Sanitize a string by redacting sensitive patterns.
 * @param input - String that may contain sensitive data
 * @returns Sanitized string with sensitive data redacted
 */
export function sanitizeString(input: string): string {
  let sanitized = input

  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => {
      // For API keys, show first 8 chars
      if (match.startsWith('napi_')) {
        return `${match.slice(0, 8)}***`
      }
      // For Bearer tokens
      if (match.toLowerCase().startsWith('bearer')) {
        return 'Bearer ***'
      }
      // For connection strings, redact credentials
      if (match.includes('postgresql://') || match.includes('postgres://')) {
        return match.replace(/\/\/[^@]+@/, '//***@')
      }
      // For JSON key-value pairs
      return match.replace(/:\s*['"][^'"]+['"]/, ': "***"')
    })
  }

  return sanitized
}

/**
 * Sanitize an object by redacting sensitive fields.
 * Creates a deep copy to avoid mutating the original.
 * @param obj - Object that may contain sensitive data
 * @returns Sanitized copy of the object
 */
export function sanitizeObject<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj
  }

  if (typeof obj !== 'object') {
    if (typeof obj === 'string') {
      return sanitizeString(obj) as T
    }
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item)) as T
  }

  const sanitized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase()

    // Redact known sensitive keys
    if (
      lowerKey.includes('password') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('token') ||
      lowerKey.includes('apikey') ||
      lowerKey.includes('api_key') ||
      lowerKey === 'authorization'
    ) {
      sanitized[key] = '***'
      continue
    }

    // Recursively sanitize nested objects
    if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value)
    } else if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value)
    } else {
      sanitized[key] = value
    }
  }

  return sanitized as T
}

/**
 * Sanitize Error objects, including axios errors with config data.
 * @param error - Error object to sanitize
 * @returns Sanitized error object safe for logging
 */
export function sanitizeError(error: unknown): unknown {
  if (!(error instanceof Error)) {
    return error
  }

  const sanitized: Record<string, unknown> = {
    message: error.message,
    name: error.name,
    stack: error.stack,
  }

  // Handle axios errors which include request config
  const errorObj = error as Record<string, unknown>
  if (errorObj.config && typeof errorObj.config === 'object') {
    sanitized.config = sanitizeObject(errorObj.config)
  }

  if (errorObj.response && typeof errorObj.response === 'object') {
    const response = errorObj.response as Record<string, unknown>
    sanitized.response = {
      status: response.status,
      statusText: response.statusText,
      // Don't log response data as it might contain sensitive info
      data: response.data && typeof response.data === 'object'
        ? sanitizeObject(response.data)
        : '[sanitized]',
    }
  }

  // Copy other enumerable properties
  for (const key of Object.keys(errorObj)) {
    if (!(key in sanitized) && key !== 'request') {
      const value = errorObj[key]
      if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeObject(value)
      } else {
        sanitized[key] = value
      }
    }
  }

  return sanitized
}
