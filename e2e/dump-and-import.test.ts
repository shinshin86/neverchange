import { test, expect } from "@playwright/test";

// sleep function for debugging
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test.describe("NeverChangeDB Dump and Import", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await sleep(100);
  });

  test("should dump and import database correctly", async ({ page }) => {
    // Initialize the database
    const dumpedData = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("dump-test-db");
      await db.init();
      await db.execute(`
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT
        )
      `);
      await db.execute("INSERT INTO test_table (name) VALUES (?)", ["Test 1"]);
      await db.execute("INSERT INTO test_table (name) VALUES (?)", ["Test 2"]);

      return await db.dumpDatabase();
    });

    expect(dumpedData).not.toContain("PRAGMA foreign_keys=OFF");
    expect(dumpedData).not.toContain("BEGIN TRANSACTION");
    expect(dumpedData).toContain("CREATE TABLE test_table");
    expect(dumpedData).toContain("INSERT INTO test_table");
    expect(dumpedData).toContain("Test 1");
    expect(dumpedData).toContain("Test 2");

    // Import the dumped data
    const importedData = await page.evaluate(async (dumpContent) => {
      try {
        const db = new (window as any).NeverChangeDB("import-test-db");
        await db.init();
        await db.importDump(dumpContent);
        return await db.query("SELECT * FROM test_table");
      } catch (error) {
        return error;
      }
    }, dumpedData);

    expect(importedData).toHaveLength(2);
    expect(importedData[0].name).toBe("Test 1");
    expect(importedData[1].name).toBe("Test 2");
  });

  test("should dump and import database correctly (compatibilityMode)", async ({
    page,
  }) => {
    // Initialize the database
    const dumpedData = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("dump-test-db");
      await db.init();
      await db.execute(`
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT
        )
      `);
      await db.execute("INSERT INTO test_table (name) VALUES (?)", ["Test 1"]);
      await db.execute("INSERT INTO test_table (name) VALUES (?)", ["Test 2"]);

      return await db.dumpDatabase({ compatibilityMode: true });
    });

    expect(dumpedData).toContain("PRAGMA foreign_keys = OFF");
    expect(dumpedData).toContain("BEGIN TRANSACTION");
    expect(dumpedData).toContain("CREATE TABLE test_table");
    expect(dumpedData).toContain("INSERT INTO test_table");
    expect(dumpedData).toContain("Test 1");
    expect(dumpedData).toContain("Test 2");

    // Import the dumped data
    const importedData = await page.evaluate(async (dumpContent) => {
      try {
        const db = new (window as any).NeverChangeDB("import-test-db");
        await db.init();
        await db.importDump(dumpContent, { compatibilityMode: true });
        return await db.query("SELECT * FROM test_table");
      } catch (error) {
        return error;
      }
    }, dumpedData);

    expect(importedData).toHaveLength(2);
    expect(importedData[0].name).toBe("Test 1");
    expect(importedData[1].name).toBe("Test 2");
  });
});
