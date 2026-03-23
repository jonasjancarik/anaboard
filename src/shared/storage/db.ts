import * as SQLite from 'expo-sqlite';

import { migrateDatabaseSchema, type MigrationDatabase } from './migrations';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let didMigrate = false;

export const getDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('anaboard.db');
  }

  const db = await databasePromise;

  if (!didMigrate) {
    await migrateDatabaseSchema(db as unknown as MigrationDatabase);
    didMigrate = true;
  }

  return db;
};
