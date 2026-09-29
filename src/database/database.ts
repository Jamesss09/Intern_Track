/**
 * Database connection singleton.
 *
 * The handle is a cached *promise*, not a module variable holding the resolved
 * database, so two screens mounting at once cannot each start their own
 * migration pass. See vault note `Database` -> "Connection & Migrations".
 */

import * as SQLite from 'expo-sqlite';
import { MIGRATIONS, LATEST_VERSION } from './migrations';

const DATABASE_NAME = 'interntrack.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Apply any migrations the database has not seen yet. */
const runMigrations = async (db: SQLite.SQLiteDatabase): Promise<void> => {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let current = row?.user_version ?? 0;

  if (current >= LATEST_VERSION) return;

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;

    // Exclusive, so no other async query can interleave into the transaction.
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(migration.up);
      await txn.execAsync(`PRAGMA user_version = ${migration.version};`);
    });

    current = migration.version;
  }
};

const open = async (): Promise<SQLite.SQLiteDatabase> => {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

  // Required for ON DELETE CASCADE. Not persistent across connections, so this
  // must be set on every open.
  await db.execAsync('PRAGMA foreign_keys = ON;');

  // Write-ahead logging lets the UI read while a write is in flight.
  await db.execAsync('PRAGMA journal_mode = WAL;');

  await runMigrations(db);
  return db;
};

export const getDatabase = (): Promise<SQLite.SQLiteDatabase> => {
  if (!dbPromise) {
    dbPromise = open().catch((error) => {
      // Clear the cache so a later attempt can retry instead of awaiting a
      // permanently rejected promise.
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
};

/** Test/dev helper. Closes the handle so the next call reopens. */
export const resetDatabase = async (): Promise<void> => {
  const pending = dbPromise;
  dbPromise = null;
  if (pending) {
    const db = await pending.catch(() => null);
    await db?.closeAsync();
  }
};
