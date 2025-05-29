import { test, expect } from "@playwright/test";

// sleep function for debugging
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test.describe("NeverChangeDB BLOB Data Handling", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await sleep(100);
  });

  test("should handle BLOB data in basic operations", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("blob-basic-db");
      await db.init();

      await db.execute(`
        CREATE TABLE blob_test (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          data BLOB
        )
      `);

      // Create a simple Uint8Array
      const blobData = new Uint8Array([1, 2, 3, 4, 5]);

      await db.execute("INSERT INTO blob_test (name, data) VALUES (?, ?)", [
        "test_blob",
        blobData,
      ]);

      const rows = await db.query("SELECT * FROM blob_test");
      await db.close();

      return {
        name: rows[0].name,
        dataType: typeof rows[0].data,
        dataKeys: Object.keys(rows[0].data || {}),
        dataValues: Object.values(rows[0].data || {}),
      };
    });

    expect(result.name).toBe("test_blob");
    expect(result.dataType).toBe("object");
    expect(result.dataValues).toEqual([1, 2, 3, 4, 5]);
  });

  test("should dump and import BLOB data correctly", async ({ page }) => {
    const { dumpContent, importedData } = await page.evaluate(async () => {
      // Create database with BLOB data
      const db1 = new (window as any).NeverChangeDB("blob-dump-db");
      await db1.init();

      await db1.execute(`
        CREATE TABLE blob_test (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          data BLOB
        )
      `);

      // Insert BLOB data
      const blobData = new Uint8Array([10, 20, 30, 40, 50]);
      await db1.execute("INSERT INTO blob_test (name, data) VALUES (?, ?)", [
        "test_blob",
        blobData,
      ]);

      // Dump the database
      const dumpContent = await db1.dumpDatabase();
      await db1.close();

      // Import into new database
      const db2 = new (window as any).NeverChangeDB("blob-import-db");
      await db2.init();
      await db2.importDump(dumpContent);

      const importedRows = await db2.query("SELECT * FROM blob_test");
      await db2.close();

      return {
        dumpContent,
        importedData: {
          name: importedRows[0].name,
          dataValues: Object.values(importedRows[0].data || {}),
        },
      };
    });

    // Check that dump contains BLOB data (may not be in hex format due to SQLite WASM behavior)
    expect(dumpContent).toContain("INSERT INTO blob_test");
    expect(dumpContent).toContain("test_blob");

    // Check that imported data is correct
    expect(importedData.name).toBe("test_blob");
    expect(importedData.dataValues).toEqual([10, 20, 30, 40, 50]);
  });

  test("should dump and import BLOB data with compatibility mode", async ({
    page,
  }) => {
    const { dumpContent, importedData } = await page.evaluate(async () => {
      // Create database with BLOB data
      const db1 = new (window as any).NeverChangeDB("blob-compat-dump-db");
      await db1.init();

      await db1.execute(`
        CREATE TABLE blob_test (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          data BLOB
        )
      `);

      // Insert BLOB data
      const blobData = new Uint8Array([100, 200, 255, 0, 128]);
      await db1.execute("INSERT INTO blob_test (name, data) VALUES (?, ?)", [
        "compat_blob",
        blobData,
      ]);

      // Dump with compatibility mode
      const dumpContent = await db1.dumpDatabase({ compatibilityMode: true });
      await db1.close();

      // Import with compatibility mode
      const db2 = new (window as any).NeverChangeDB("blob-compat-import-db");
      await db2.init();
      await db2.importDump(dumpContent, { compatibilityMode: true });

      const importedRows = await db2.query("SELECT * FROM blob_test");
      await db2.close();

      return {
        dumpContent,
        importedData: {
          name: importedRows[0].name,
          dataValues: Object.values(importedRows[0].data || {}),
        },
      };
    });

    // Check compatibility mode markers
    expect(dumpContent).toContain("PRAGMA foreign_keys = OFF");
    expect(dumpContent).toContain("BEGIN TRANSACTION");

    // Check BLOB data
    expect(dumpContent).toContain("INSERT INTO blob_test");
    expect(dumpContent).toContain("compat_blob");

    // Check imported data
    expect(importedData.name).toBe("compat_blob");
    expect(importedData.dataValues).toEqual([100, 200, 255, 0, 128]);
  });

  test("should handle multiple BLOB columns", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("multi-blob-db");
      await db.init();

      await db.execute(`
        CREATE TABLE multi_blob_test (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          image_data BLOB,
          metadata BLOB
        )
      `);

      // Insert multiple BLOB columns
      const imageData = new Uint8Array([255, 216, 255, 224]); // JPEG header-like
      const metadataBlob = new Uint8Array([1, 0, 1, 0, 2, 0]); // Some metadata

      await db.execute(
        "INSERT INTO multi_blob_test (name, image_data, metadata) VALUES (?, ?, ?)",
        ["test_image", imageData, metadataBlob],
      );

      // Dump and import
      const dumpContent = await db.dumpDatabase();

      const db2 = new (window as any).NeverChangeDB("multi-blob-import-db");
      await db2.init();
      await db2.importDump(dumpContent);

      const rows = await db2.query("SELECT * FROM multi_blob_test");
      await db.close();
      await db2.close();

      return {
        name: rows[0].name,
        imageDataValues: Object.values(rows[0].image_data || {}),
        metadataValues: Object.values(rows[0].metadata || {}),
      };
    });

    expect(result.name).toBe("test_image");
    expect(result.imageDataValues).toEqual([255, 216, 255, 224]);
    expect(result.metadataValues).toEqual([1, 0, 1, 0, 2, 0]);
  });

  test("should handle empty and null BLOB data", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("empty-blob-db");
      await db.init();

      await db.execute(`
        CREATE TABLE empty_blob_test (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          data BLOB
        )
      `);

      // Insert empty BLOB
      const emptyBlob = new Uint8Array([]);
      await db.execute(
        "INSERT INTO empty_blob_test (name, data) VALUES (?, ?)",
        ["empty_blob", emptyBlob],
      );

      // Insert null BLOB
      await db.execute(
        "INSERT INTO empty_blob_test (name, data) VALUES (?, ?)",
        ["null_blob", null],
      );

      // Dump and import
      const dumpContent = await db.dumpDatabase();

      const db2 = new (window as any).NeverChangeDB("empty-blob-import-db");
      await db2.init();
      await db2.importDump(dumpContent);

      const rows = await db2.query("SELECT * FROM empty_blob_test ORDER BY id");
      await db.close();
      await db2.close();

      return {
        emptyBlobRow: {
          name: rows[0].name,
          data: rows[0].data,
        },
        nullBlobRow: {
          name: rows[1].name,
          data: rows[1].data,
        },
      };
    });

    expect(result.emptyBlobRow.name).toBe("empty_blob");
    expect(result.emptyBlobRow.data).toBeDefined();

    expect(result.nullBlobRow.name).toBe("null_blob");
    expect(result.nullBlobRow.data).toBeNull();
  });

  test("should handle large BLOB data", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("large-blob-db");
      await db.init();

      await db.execute(`
        CREATE TABLE large_blob_test (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          data BLOB
        )
      `);

      // Create a larger BLOB (1KB)
      const largeBlob = new Uint8Array(1024);
      for (let i = 0; i < 1024; i++) {
        largeBlob[i] = i % 256;
      }

      await db.execute(
        "INSERT INTO large_blob_test (name, data) VALUES (?, ?)",
        ["large_blob", largeBlob],
      );

      // Dump and import
      const dumpContent = await db.dumpDatabase();

      const db2 = new (window as any).NeverChangeDB("large-blob-import-db");
      await db2.init();
      await db2.importDump(dumpContent);

      const rows = await db2.query("SELECT * FROM large_blob_test");
      await db.close();
      await db2.close();

      const importedData = Object.values(rows[0].data || {});

      return {
        name: rows[0].name,
        dataLength: importedData.length,
        firstFewBytes: importedData.slice(0, 10),
        lastFewBytes: importedData.slice(-10),
      };
    });

    expect(result.name).toBe("large_blob");
    expect(result.dataLength).toBe(1024);
    expect(result.firstFewBytes).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.lastFewBytes).toEqual([
      246, 247, 248, 249, 250, 251, 252, 253, 254, 255,
    ]);
  });

  test("should provide utility function example for BLOB conversion", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("blob-utility-db");
      await db.init();

      await db.execute(`
        CREATE TABLE blob_utility_test (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          data BLOB
        )
      `);

      // Insert BLOB data
      const originalBlob = new Uint8Array([72, 101, 108, 108, 111]); // "Hello" in ASCII
      await db.execute(
        "INSERT INTO blob_utility_test (name, data) VALUES (?, ?)",
        ["hello_blob", originalBlob],
      );

      const rows = await db.query("SELECT * FROM blob_utility_test");

      // Utility function to convert object back to Uint8Array
      const convertToUint8Array = (obj: any): Uint8Array => {
        if (obj && typeof obj === "object" && !Array.isArray(obj)) {
          return new Uint8Array(Object.values(obj) as number[]);
        }
        return obj;
      };

      const convertedBlob = convertToUint8Array(rows[0].data);

      await db.close();

      return {
        originalType: typeof rows[0].data,
        convertedType: convertedBlob.constructor.name,
        convertedData: Array.from(convertedBlob),
        asString: String.fromCharCode(...convertedBlob),
      };
    });

    expect(result.originalType).toBe("object");
    expect(result.convertedType).toBe("Uint8Array");
    expect(result.convertedData).toEqual([72, 101, 108, 108, 111]);
    expect(result.asString).toBe("Hello");
  });
});
