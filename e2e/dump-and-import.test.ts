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

  test("should dump specific table correctly", async ({ page }) => {
    // Initialize the database with two tables
    const { fullDump, tableDump } = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB(
        "dump-specific-table-test-db",
      );
      await db.init();
      await db.execute(`
        CREATE TABLE test_table1 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT
        )
      `);
      await db.execute(`
        CREATE TABLE test_table2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT
        )
      `);
      await db.execute("INSERT INTO test_table1 (name) VALUES (?)", ["Test 1"]);
      await db.execute("INSERT INTO test_table2 (email) VALUES (?)", [
        "test@example.com",
      ]);

      const fullDump = await db.dumpDatabase();
      const tableDump = await db.dumpDatabase({ table: "test_table1" });

      return { fullDump, tableDump };
    });

    // Check full dump
    expect(fullDump).toContain("CREATE TABLE test_table1");
    expect(fullDump).toContain("CREATE TABLE test_table2");
    expect(fullDump).toContain("INSERT INTO test_table1");
    expect(fullDump).toContain("INSERT INTO test_table2");
    expect(fullDump).toContain("Test 1");
    expect(fullDump).toContain("test@example.com");

    // Check specific table dump
    expect(tableDump).toContain("CREATE TABLE test_table1");
    expect(tableDump).not.toContain("CREATE TABLE test_table2");
    expect(tableDump).toContain("INSERT INTO test_table1");
    expect(tableDump).not.toContain("INSERT INTO test_table2");
    expect(tableDump).toContain("Test 1");
    expect(tableDump).not.toContain("test@example.com");
  });

  test("should dump and import specific table correctly", async ({ page }) => {
    // Initialize the database with multiple tables
    const { tableDump } = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB(
        "dump-specific-table-test-db",
      );
      await db.init();

      // Create multiple tables
      await db.execute(`
        CREATE TABLE test_table1 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT
        )
      `);
      await db.execute(`
        CREATE TABLE test_table2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT
        )
      `);
      await db.execute("INSERT INTO test_table1 (name) VALUES (?)", ["Test 1"]);
      await db.execute("INSERT INTO test_table2 (email) VALUES (?)", [
        "test@example.com",
      ]);

      // Dump only test_table1
      const tableDump = await db.dumpDatabase({ table: "test_table1" });

      return { tableDump };
    });

    const importedData = await page.evaluate(async (dumpContent) => {
      try {
        const db = new (window as any).NeverChangeDB(
          "import-specific-table-test-db",
        );
        await db.init();
        await db.importDump(dumpContent);

        const tables = await db.query(
          "SELECT name FROM sqlite_master WHERE type='table'",
        );
        const table1Data = await db.query("SELECT * FROM test_table1");

        return { tables, table1Data };
      } catch (error) {
        return error;
      }
    }, tableDump);

    // Check if only test_table1 was imported
    expect(importedData.tables).toHaveLength(2);
    expect(
      importedData.tables.filter((table) =>
        ["test_table1", "sqlite_sequence"].includes(table.name),
      ).length,
    ).toBe(2);

    // Check if the data in test_table1 is correct
    expect(importedData.table1Data).toHaveLength(1);
    expect(importedData.table1Data[0].name).toBe("Test 1");
  });
});
