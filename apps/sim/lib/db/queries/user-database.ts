/**
 * Database query helpers for user-level Neon databases.
 * Handles user_global_database and user_db_budget tables.
 */

import { db } from '@sim/db'
import { userDbBudget, userGlobalDatabase } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { eq } from 'drizzle-orm'
import { encrypt } from '@/lib/encryption'
import type { NeonDatabaseResult } from '@/lib/neon'

const logger = createLogger('UserDatabaseQueries')

interface CreateUserGlobalDatabaseRecordParams {
  userId: string
  neonResult: NeonDatabaseResult
}

/**
 * Creates a user_global_database record after Neon project creation.
 */
export async function createUserGlobalDatabaseRecord({
  userId,
  neonResult,
}: CreateUserGlobalDatabaseRecordParams): Promise<void> {
  const encryptedUri = encrypt(neonResult.connectionUri)

  await db.insert(userGlobalDatabase).values({
    id: crypto.randomUUID(),
    userId,
    ownershipType: 'platform',
    neonProjectId: neonResult.projectId,
    neonBranchId: neonResult.branchId,
    neonConnectionUri: encryptedUri,
    databaseName: neonResult.databaseName,
  })

  logger.info('Created user_global_database record', { userId })
}

/**
 * Creates a user_db_budget record for a new user.
 */
export async function createUserDbBudgetRecord(userId: string): Promise<void> {
  await db.insert(userDbBudget).values({
    id: crypto.randomUUID(),
    userId,
    budgetExceeded: false,
    totalCostCents: 0,
  })

  logger.info('Created user_db_budget record', { userId })
}

/**
 * Gets the user_global_database record for a user.
 */
export async function getUserGlobalDatabase(userId: string) {
  const records = await db
    .select()
    .from(userGlobalDatabase)
    .where(eq(userGlobalDatabase.userId, userId))
    .limit(1)

  return records[0] ?? null
}

/**
 * Gets the user_db_budget record for a user.
 */
export async function getUserDbBudget(userId: string) {
  const records = await db
    .select()
    .from(userDbBudget)
    .where(eq(userDbBudget.userId, userId))
    .limit(1)

  return records[0] ?? null
}
