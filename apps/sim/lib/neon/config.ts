/**
 * Default project settings for new Neon databases.
 */
export const NEON_PROJECT_DEFAULTS = {
  /** Default PostgreSQL version */
  pgVersion: 17,

  /** Default region */
  regionId: 'aws-us-east-1',

  /** Default database name (Neon default) */
  databaseName: 'neondb',

  /** Minimum compute units (scale to zero) */
  autoscalingMinCu: 0.25,

  /** Maximum compute units when active */
  autoscalingMaxCu: 2,

  /** Seconds of inactivity before suspending (aggressive scale-to-zero) */
  suspendTimeoutSeconds: 60,
} as const
