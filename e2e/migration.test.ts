import { test, expect } from "@playwright/test";

// sleep function for debugging
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test.describe("Migration", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await sleep(100);
  });

  test("should initialize the database with migrations", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const dbName = "migratable-test-db";
      const db = new (window as any).NeverChangeDB(dbName);

      const migrations = [
        {
          version: 1,
          up: async (db) => {
            await db.execute(`
              CREATE TABLE IF NOT EXISTS todos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,
                completed BOOLEAN NOT NULL DEFAULT 0
              )
            `);
          },
        },
        {
          version: 2,
          up: async (db) => {
            await db.execute(
              "ALTER TABLE todos ADD COLUMN deleted BOOLEAN NOT NULL DEFAULT 0",
            );
          },
        },
      ];

      db.addMigrations(migrations);
      await db.init();

      // Check if the migrations were applied
      const tableInfo = await db.query("PRAGMA table_info(todos)");
      await db.close();

      return tableInfo;
    });

    expect(result).toContainEqual(expect.objectContaining({ name: "deleted" }));
  });

  test("should apply migrations in order", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const dbName = "migratable-test-db-order";
      const db = new (window as any).NeverChangeDB(dbName);

      const migrations = [
        {
          version: 1,
          up: async (db) => {
            await db.execute(
              "CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)",
            );
          },
        },
        {
          version: 2,
          up: async (db) => {
            await db.execute("ALTER TABLE test ADD COLUMN age INTEGER");
          },
        },
      ];

      db.addMigrations(migrations);
      await db.init();

      const migrationVersions = await db.query(
        "SELECT version FROM migrations ORDER BY version",
      );
      await db.close();

      return migrationVersions;
    });

    expect(result).toEqual([{ version: 1 }, { version: 2 }]);
  });

  test("should not apply migrations that have already been applied", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const dbName = "migratable-test-db-reapply";
      const db = new (window as any).NeverChangeDB(dbName);

      const migrations = [
        {
          version: 1,
          up: async (db) => {
            await db.execute(
              "CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)",
            );
          },
        },
      ];

      db.addMigrations(migrations);
      await db.init();

      // Try to apply the same migration again
      await db.init();

      const migrationVersions = await db.query(
        "SELECT version FROM migrations",
      );
      await db.close();

      return migrationVersions;
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ version: 1 });
  });

  test("should handle errors in migrations gracefully", async ({ page }) => {
    const error = await page.evaluate(async () => {
      const dbName = "migratable-test-db-error";
      const db = new (window as any).NeverChangeDB(dbName);

      const migrations = [
        {
          version: 1,
          up: async (db) => {
            await db.execute(
              "CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)",
            );
          },
        },
        {
          version: 2,
          up: async (db) => {
            await db.execute("INVALID SQL STATEMENT");
          },
        },
      ];

      db.addMigrations(migrations);
      try {
        await db.init();
      } catch (err) {
        await db.close();
        return { type: err.type, sql: err.result.input.args.sql };
      }
    });

    expect(error?.type).toContain("error");
    expect(error?.sql).toContain("INVALID SQL STATEMENT");
  });
});
