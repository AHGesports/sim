/**
 * Default project settings for new Neon databases.
 */
export const NEON_PROJECT_DEFAULTS = {
  /** Default PostgreSQL version */
  pgVersion: 17,

  /** Default region */
  regionId: 'aws-us-east-1',

  /** Default database name (Neon default) */
  databaseName: 'agentdb',

  /** Minimum compute units (scale to zero) */
  autoscalingMinCu: 0.25,

  /** Maximum compute units when active */
  autoscalingMaxCu: 2,

  /**
   * Seconds of inactivity before suspending.
   * NOTE: Free tier does NOT allow setting this parameter - Neon uses its default (5 minutes).
   * Only paid plans can customize this value.
   * Set to null to omit this parameter and use Neon's default.
   */
  suspendTimeoutSeconds: null as number | null,
} as const
