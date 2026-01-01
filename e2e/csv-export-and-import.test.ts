import { test, expect } from "@playwright/test";

// sleep function for debugging
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test.describe("NeverChangeDB CSV Export and Import", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await sleep(100);
  });

  test("should export table to CSV correctly", async ({ page }) => {
    // Initialize the database
    const csvContent = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("csv-export-db");
      await db.init();
      await db.execute(`
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          email TEXT
        )
      `);
      await db.execute("INSERT INTO test_table (name, email) VALUES (?, ?)", [
        "John Doe",
        "john@example.com",
      ]);
      await db.execute("INSERT INTO test_table (name, email) VALUES (?, ?)", [
        "Jane Smith",
        "jane@example.com",
      ]);

      // Export table to CSV
      return await db.dumpTableToCSV("test_table");
    });

    expect(csvContent).toContain("id,name,email");
    expect(csvContent).toContain("John Doe,john@example.com");
    expect(csvContent).toContain("Jane Smith,jane@example.com");
  });

  test("should import CSV content into table correctly", async ({ page }) => {
    const csvContent =
      "id,name,email\n1,John Doe,john@example.com\n2,Jane Smith,jane@example.com";

    // Import CSV into a new database
    const importedData = await page.evaluate(async (csvContent) => {
      const db = new (window as any).NeverChangeDB("csv-import-db");
      await db.init();
      await db.execute(`
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          email TEXT
        )
      `);

      // Import the CSV content into the table
      await db.importCSVToTable("test_table", csvContent);

      return await db.query("SELECT * FROM test_table");
    }, csvContent);

    expect(importedData).toHaveLength(2);
    expect(importedData[0].name).toBe("John Doe");
    expect(importedData[0].email).toBe("john@example.com");
    expect(importedData[1].name).toBe("Jane Smith");
    expect(importedData[1].email).toBe("jane@example.com");
  });

  test("should handle empty CSV export and import", async ({ page }) => {
    const csvContent = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("empty-csv-db");
      await db.init();
      await db.execute(`
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          email TEXT
        )
      `);

      // Export empty table to CSV
      return await db.dumpTableToCSV("test_table");
    });

    expect(csvContent).toContain("id,name,email");
    expect(csvContent.split("\r\n").filter(Boolean)).toHaveLength(1); // Only headers

    // Import empty CSV content back into a new table
    const importedData = await page.evaluate(async (csvContent) => {
      const db = new (window as any).NeverChangeDB("empty-csv-import-db");
      await db.init();
      await db.execute(`
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          email TEXT
        )
      `);

      await db.importCSVToTable("test_table", csvContent);

      return await db.query("SELECT * FROM test_table");
    }, csvContent);

    expect(importedData).toHaveLength(0);
  });

  test("should handle CSV with special characters (default behavior)", async ({
    page,
  }) => {
    const csvContent = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("csv-special-chars-db");
      await db.init();
      await db.execute(`
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          description TEXT
        )
      `);
      await db.execute(
        "INSERT INTO test_table (name, description) VALUES (?, ?)",
        ["John Doe", 'This is a test with, commas and "quotes".'],
      );

      return await db.dumpTableToCSV("test_table");
    });

    expect(csvContent).toBe(
      `id,name,description\r\n1,John Doe,"This is a test with, commas and ""quotes""."\r\n`,
    );

    // Import the CSV content back into the table and validate
    const importedData = await page.evaluate(async (csvContent) => {
      const db = new (window as any).NeverChangeDB("csv-special-import-db");
      await db.init();
      await db.execute(`
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          description TEXT
        )
      `);

      await db.importCSVToTable("test_table", csvContent);

      return await db.query("SELECT * FROM test_table");
    }, csvContent);

    expect(importedData).toHaveLength(1);
    expect(importedData[0].name).toBe("John Doe");
    expect(importedData[0].description).toBe(
      'This is a test with, commas and "quotes".',
    );
  });

  test("should handle CSV with special characters (quoteAllFields option)", async ({
    page,
  }) => {
    const csvContent = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("csv-quote-all-fields-db");
      await db.init();
      await db.execute(`
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          description TEXT
        )
      `);
      await db.execute(
        "INSERT INTO test_table (name, description) VALUES (?, ?)",
        ["John Doe", 'This is a test with, commas and "quotes".'],
      );

      // Export table to CSV with quoteAllFields option
      return await db.dumpTableToCSV("test_table", { quoteAllFields: true });
    });

    expect(csvContent).toBe(
      `"id","name","description"\r\n"1","John Doe","This is a test with, commas and ""quotes""."\r\n`,
    );

    // Import the CSV content back into the table and validate
    const importedData = await page.evaluate(async (csvContent) => {
      const db = new (window as any).NeverChangeDB("csv-special-import-db");
      await db.init();
      await db.execute(`
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          description TEXT
        )
      `);

      await db.importCSVToTable("test_table", csvContent);

      return await db.query("SELECT * FROM test_table");
    }, csvContent);

    expect(importedData).toHaveLength(1);
    expect(importedData[0].name).toBe("John Doe");
    expect(importedData[0].description).toBe(
      'This is a test with, commas and "quotes".',
    );
  });

  test("should import CSV with quoted multiline field", async ({ page }) => {
    const csvContent =
      'id,role,content,timestamp\n1,user,"hello\nworld",2024-01-01T00:00:00.000Z';

    const importedData = await page.evaluate(async (csvContent) => {
      const db = new (window as any).NeverChangeDB("csv-multiline-import-db");
      await db.init();
      await db.execute(`
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          role TEXT,
          content TEXT,
          timestamp TEXT
        )
      `);

      await db.importCSVToTable("test_table", csvContent);

      return await db.query("SELECT * FROM test_table");
    }, csvContent);

    expect(importedData).toHaveLength(1);
    expect(importedData[0].content).toBe("hello\nworld");
    expect(importedData[0].role).toBe("user");
  });

  test("should import CSV with BOM and trailing newline", async ({ page }) => {
    const csvContent = "\uFEFFid,name\n1,Alice\n";

    const importedData = await page.evaluate(async (csvContent) => {
      const db = new (window as any).NeverChangeDB("csv-bom-import-db");
      await db.init();
      await db.execute(`
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT
        )
      `);

      await db.importCSVToTable("test_table", csvContent);

      return await db.query("SELECT * FROM test_table");
    }, csvContent);

    expect(importedData).toHaveLength(1);
    expect(importedData[0].name).toBe("Alice");
  });

  test("should throw error when CSV row has mismatched column count", async ({
    page,
  }) => {
    const csvContent = "id,name,email\n1,John";

    const error = await page.evaluate(async (csvContent) => {
      const db = new (window as any).NeverChangeDB("csv-mismatch-db");
      await db.init();
      await db.execute(`
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY,
          name TEXT,
          email TEXT
        )
      `);

      try {
        await db.importCSVToTable("test_table", csvContent);
        return null;
      } catch (e: any) {
        return e.message;
      }
    }, csvContent);

    expect(error).toContain("row 2 has 2 fields, but header has 3 columns");
  });
});
