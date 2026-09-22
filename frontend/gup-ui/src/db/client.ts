import type { SQLiteBindParams, SQLiteDatabase } from 'expo-sqlite';
import * as SQLite from 'expo-sqlite';

import { runMigrations } from './migrations';

let dbInstance: SQLiteDatabase | null = null;
let writeChain: Promise<void> = Promise.resolve();

export async function openDatabase(): Promise<SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  const db = await SQLite.openDatabaseAsync('gup.db');
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await runMigrations(db);
  dbInstance = db;
  return db;
}

export function getDatabase(): SQLiteDatabase {
  if (!dbInstance) {
    throw new Error('Database is not open — wrap the app in DatabaseProvider');
  }
  return dbInstance;
}

/** Serializes concurrent writes to avoid SQLITE_BUSY under rapid WebSocket + UI updates. */
export function runSerialized<T>(operation: () => Promise<T>): Promise<T> {
  const next = writeChain.then(operation);
  writeChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export async function executeAsync(
  sql: string,
  params: SQLiteBindParams = []
): Promise<void> {
  await runSerialized(() => getDatabase().runAsync(sql, params));
}

export async function getAllAsync<T>(
  sql: string,
  params: SQLiteBindParams = []
): Promise<T[]> {
  return getDatabase().getAllAsync<T>(sql, params);
}

export async function getFirstAsync<T>(
  sql: string,
  params: SQLiteBindParams = []
): Promise<T | null> {
  return getDatabase().getFirstAsync<T>(sql, params);
}

/** Deletes all local rows so the next account does not inherit sessions or history. */
export async function wipeLocalDatabase(): Promise<void> {
  if (!dbInstance) {
    return;
  }
  await runSerialized(async () => {
    await dbInstance!.execAsync(`
      DELETE FROM messages;
      DELETE FROM conversations;
      DELETE FROM outbox_pending;
      DELETE FROM signal_sessions;
      DELETE FROM signal_identity_peers;
    `);
  });
}
