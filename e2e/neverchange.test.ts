import { test, expect } from "@playwright/test";

// sleep function for debugging
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test.describe("NeverChangeDB", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await sleep(100);
  });

  test("should initialize the database", async ({ page }) => {
    const isNeverChangeDBDefined = await page.evaluate(() => {
      return typeof (window as any).NeverChangeDB === "function";
    });
    expect(isNeverChangeDBDefined).toBe(true);

    const initializedDb = await page.evaluate(async () => {
      const dbName = "test-db";
      const db = new (window as any).NeverChangeDB(dbName);
      await db.init();

      try {
        await db.query("SELECT 1");
        return db;
      } catch (error) {
        console.error("Database initialization error:", error);
        return false;
      }
    });

    const isInitialized = initializedDb.dbId !== null;
    expect(isInitialized).toBe(true);
  });

  test("should execute SQL statements", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const dbName = "test-db";
      const db = new (window as any).NeverChangeDB(dbName);
      await db.init();
      await db.execute("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)");
      await db.execute("INSERT INTO test (name) VALUES (?)", ["Test Name"]);
      return await db.query("SELECT * FROM test");
    });

    expect(result).toEqual([{ id: 1, name: "Test Name" }]);
  });

  test("should handle multiple queries", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("test-db");
      await db.init();
      await db.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)",
      );
      await db.execute("INSERT INTO users (name, age) VALUES (?, ?)", [
        "Alice",
        30,
      ]);
      await db.execute("INSERT INTO users (name, age) VALUES (?, ?)", [
        "Bob",
        25,
      ]);
      return await db.query("SELECT * FROM users ORDER BY age DESC");
    });

    expect(result).toEqual([
      { id: 1, name: "Alice", age: 30 },
      { id: 2, name: "Bob", age: 25 },
    ]);
  });

  test("should handle errors gracefully", async ({ page }) => {
    const error = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("test-db");
      await db.init();
      try {
        await db.query("SELECT * FROM non_existent_table");
      } catch (err) {
        return { type: err.type, sql: err.result.input.args.sql };
      }
    });

    expect(error?.type).toContain("error");
    expect(error?.sql).toContain("SELECT * FROM non_existent_table");
  });

  test("should close the database", async ({ page }) => {
    const closed = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("test-db");
      await db.init();
      await db.close();

      try {
        await db["getPromiser"]();
        return false;
      } catch (err) {
        return err.message === "Database not initialized. Call init() first.";
      }
    });

    expect(closed).toBe(true);
  });

  // if OPFS is disabled, this test will fail
  test.skip("should persist data between connections", async ({ page }) => {
    await page.evaluate(async () => {
      const db1 = new (window as any).NeverChangeDB("persist-test-db");
      await db1.init();
      await db1.execute(
        "CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, value TEXT)",
      );
      await db1.execute("INSERT INTO test (value) VALUES (?)", [
        "Persistent Data",
      ]);
      await db1.close();
    });

    const persistedData = await page.evaluate(async () => {
      const db2 = new (window as any).NeverChangeDB("persist-test-db");
      await db2.init();
      const result = await db2.query("SELECT * FROM test");
      await db2.close();
      return result;
    });

    expect(persistedData).toEqual([{ id: 1, value: "Persistent Data" }]);
  });
});
