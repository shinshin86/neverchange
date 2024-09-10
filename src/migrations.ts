import { Migration } from "./types";

export const initialMigration: Migration = {
  version: 0,
  up: async (db) => {
    await db.execute(`
                CREATE TABLE IF NOT EXISTS migrations (
                  version INTEGER PRIMARY KEY,
                  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
              `);
  },
};
