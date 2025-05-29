import { test, expect } from "@playwright/test";

// sleep function for debugging
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test.describe("NeverChangeDB Constructor Options", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await sleep(100);
  });

  test("should initialize with default options", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("default-options-db");
      await db.init();

      // Check if migrations table exists (default isMigrationActive: true)
      const tables = await db.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'",
      );

      await db.close();
      return tables.length > 0;
    });

    expect(result).toBe(true);
  });

  test("should initialize with debug option enabled", async ({ page }) => {
    // Capture console logs to verify debug output
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "log") {
        consoleLogs.push(msg.text());
      }
    });

    await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("debug-enabled-db", {
        debug: true,
      });
      await db.init();
      await db.close();
    });

    // Check if debug logs were generated
    const hasDebugLogs = consoleLogs.some(
      (log) =>
        log.includes("Loading and initializing SQLite3 module") ||
        log.includes("Database initialized successfully"),
    );
    expect(hasDebugLogs).toBe(true);
  });

  test("should initialize with debug option disabled", async ({ page }) => {
    // Capture console logs to verify no debug output
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "log") {
        consoleLogs.push(msg.text());
      }
    });

    await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("debug-disabled-db", {
        debug: false,
      });
      await db.init();
      await db.close();
    });

    // Check that no debug logs were generated
    const hasDebugLogs = consoleLogs.some(
      (log) =>
        log.includes("Loading and initializing SQLite3 module") ||
        log.includes("Database initialized successfully"),
    );
    expect(hasDebugLogs).toBe(false);
  });

  test("should initialize with isMigrationActive disabled", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("no-migration-db", {
        isMigrationActive: false,
      });
      await db.init();

      // Check if migrations table does NOT exist
      const tables = await db.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'",
      );

      await db.close();
      return tables.length === 0;
    });

    expect(result).toBe(true);
  });

  test("should work with manual schema when migrations disabled", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("manual-schema-db", {
        isMigrationActive: false,
      });
      await db.init();

      // Manually create table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL
        )
      `);

      // Insert and query data
      await db.execute("INSERT INTO users (name, email) VALUES (?, ?)", [
        "John Doe",
        "john@example.com",
      ]);

      const users = await db.query("SELECT * FROM users");
      await db.close();

      return users;
    });

    expect(result).toEqual([
      { id: 1, name: "John Doe", email: "john@example.com" },
    ]);
  });

  test("should not add migrations when isMigrationActive is false", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("no-migration-add-db", {
        isMigrationActive: false,
      });

      const migrations = [
        {
          version: 1,
          up: async (db) => {
            await db.execute(`
              CREATE TABLE test_table (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL
              )
            `);
          },
        },
      ];

      // Adding migrations should not affect anything when isMigrationActive is false
      db.addMigrations(migrations);
      await db.init();

      // Check if test_table was NOT created (migration not applied)
      try {
        await db.query("SELECT * FROM test_table");
        await db.close();
        return false; // Table exists, migration was applied (unexpected)
      } catch (error) {
        await db.close();
        return true; // Table doesn't exist, migration was not applied (expected)
      }
    });

    expect(result).toBe(true);
  });

  test("should combine debug and isMigrationActive options", async ({
    page,
  }) => {
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "log") {
        consoleLogs.push(msg.text());
      }
    });

    const result = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("combined-options-db", {
        debug: true,
        isMigrationActive: false,
      });
      await db.init();

      // Check if migrations table does NOT exist
      const tables = await db.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'",
      );

      await db.close();
      return tables.length === 0;
    });

    // Should have debug logs but no migrations
    const hasDebugLogs = consoleLogs.some(
      (log) =>
        log.includes("Loading and initializing SQLite3 module") ||
        log.includes("Database initialized successfully"),
    );

    expect(hasDebugLogs).toBe(true);
    expect(result).toBe(true);
  });
});
