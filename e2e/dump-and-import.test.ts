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

  test("should handle empty database dump and import", async ({ page }) => {
    const { emptyDump, importedTables } = await page.evaluate(async () => {
      let emptyDump;

      const db = new (window as any).NeverChangeDB("empty-db");
      await db.init();
      emptyDump = await db.dumpDatabase();

      const importDb = new (window as any).NeverChangeDB("import-empty-db");
      await importDb.init();
      await importDb.importDump(emptyDump);
      const importedTables = await importDb.query(
        "SELECT name FROM sqlite_master WHERE type='table'",
      );

      // This will not be done
      return { emptyDump, importedTables };
    });

    expect(emptyDump).toContain("CREATE TABLE migrations");
    expect(importedTables.length).toBe(1);
    expect(importedTables[0].name).toContain("migrations");
  });

  test("should create sqlite_sequence when using AUTOINCREMENT", async ({
    page,
  }) => {
    const { tables } = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("autoincrement-db");
      await db.init();

      // create table for using AUTOINCREMENT
      await db.execute(`
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT
        )
      `);

      const tables = await db.query(
        "SELECT name FROM sqlite_master WHERE type='table'",
      );

      return {
        tables,
      };
    });

    // tables: migrations, test_table, sqlite_sequence
    const expectedTables = ["migrations", "test_table", "sqlite_sequence"];
    expect(tables.filter((t) => expectedTables.includes(t.name)).length).toBe(
      3,
    );
  });

  test("should handle tables with various data types", async ({ page }) => {
    const { dump, importedData } = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("complex-data-db");
      await db.init();
      await db.execute(`
            CREATE TABLE complex_table (
              id INTEGER PRIMARY KEY,
              text_col TEXT,
              int_col INTEGER,
              real_col REAL,
              blob_col BLOB,
              null_col TEXT
            )
          `);
      await db.execute(
        "INSERT INTO complex_table (text_col, int_col, real_col, blob_col, null_col) VALUES (?, ?, ?, ?, ?)",
        ["text", 42, 3.14, new Uint8Array([1, 2, 3]), null],
      );

      const dump = await db.dumpDatabase();

      const importDb = new (window as any).NeverChangeDB("import-complex-db");
      await importDb.init();
      await importDb.importDump(dump);
      const importedData = await importDb.query("SELECT * FROM complex_table");

      return { dump, importedData };
    });

    expect(dump).toContain("CREATE TABLE complex_table");
    expect(dump).toContain("INSERT INTO complex_table");
    expect(importedData).toHaveLength(1);
    expect(importedData[0].text_col).toBe("text");
    expect(importedData[0].int_col).toBe(42);
    expect(importedData[0].real_col).toBeCloseTo(3.14);

    // blob_col: {"0":1,"1":2,"2":3}
    const blobColArr = Object.values(importedData[0].blob_col);
    expect(blobColArr.length).toBe(3);
    expect(blobColArr).toEqual([1, 2, 3]);
    expect(blobColArr[0]).toBe(1);
    expect(blobColArr[1]).toBe(2);
    expect(blobColArr[2]).toBe(3);
    expect(importedData[0].null_col).toBeNull();
  });

  test("should handle tables with foreign key constraints", async ({
    page,
  }) => {
    const { dump, importedData } = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("foreign-key-db");
      await db.init();
      await db.execute("PRAGMA foreign_keys = ON");
      await db.execute(`
          CREATE TABLE parent (
            id INTEGER PRIMARY KEY,
            name TEXT
          )
        `);
      await db.execute(`
          CREATE TABLE child (
            id INTEGER PRIMARY KEY,
            parent_id INTEGER,
            name TEXT,
            FOREIGN KEY (parent_id) REFERENCES parent(id)
          )
        `);
      await db.execute("INSERT INTO parent (name) VALUES (?)", ["Parent 1"]);
      await db.execute("INSERT INTO child (parent_id, name) VALUES (?, ?)", [
        1,
        "Child 1",
      ]);

      const dump = await db.dumpDatabase();

      const importDb = new (window as any).NeverChangeDB(
        "import-foreign-key-db",
      );
      await importDb.init();
      await importDb.importDump(dump);
      const parentData = await importDb.query("SELECT * FROM parent");
      const childData = await importDb.query("SELECT * FROM child");

      return { dump, importedData: { parent: parentData, child: childData } };
    });

    expect(dump).toContain("CREATE TABLE parent");
    expect(dump).toContain("CREATE TABLE child");
    expect(dump).toContain("FOREIGN KEY");
    expect(importedData.parent).toHaveLength(1);
    expect(importedData.child).toHaveLength(1);
    expect(importedData.child[0].parent_id).toBe(importedData.parent[0].id);
  });

  test("should handle large datasets", async ({ page }) => {
    const { rowCount, dumpTime, importTime } = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("large-dataset-db");
      await db.init();
      await db.execute(`
          CREATE TABLE large_table (
            id INTEGER PRIMARY KEY,
            value TEXT
          )
        `);

      const rowCount = 10000;
      const batchSize = 1000;
      for (let i = 0; i < rowCount; i += batchSize) {
        const values = Array.from(
          { length: batchSize },
          (_, j) => `(${i + j + 1}, 'Value ${i + j + 1}')`,
        ).join(",");
        await db.execute(
          `INSERT INTO large_table (id, value) VALUES ${values}`,
        );
      }

      const dumpStart = performance.now();
      const dump = await db.dumpDatabase();
      const dumpTime = performance.now() - dumpStart;

      const importDb = new (window as any).NeverChangeDB(
        "import-large-dataset-db",
      );
      await importDb.init();
      const importStart = performance.now();
      await importDb.importDump(dump);
      const importTime = performance.now() - importStart;

      const importedCount = await importDb.query(
        "SELECT COUNT(*) as count FROM large_table",
      );

      return {
        rowCount,
        dumpTime,
        importTime,
        importedCount: importedCount[0].count,
      };
    });

    expect(rowCount).toBe(10000);
    console.log(`Dump time: ${dumpTime}ms, Import time: ${importTime}ms`);
    // Set performance thresholds (may need to be adjusted depending on environment)
    expect(dumpTime).toBeLessThan(5000); // Within 5 seconds
    expect(importTime).toBeLessThan(5000); // Within 5 seconds
  });
});
