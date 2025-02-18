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
        await db.query("SELECT 1");
        return false;
      } catch (err) {
        return err.message === "Database not initialized. Call init() first.";
      }
    });

    expect(closed).toBe(true);
  });

  test("should persist data between connections", async ({ page }) => {
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

  test("should commit a transaction", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const dbName = "test-transaction-db";
      const db = new (window as any).NeverChangeDB(dbName);
      await db.init();

      await db.execute("DROP TABLE IF EXISTS transaction_test");
      await db.execute(
        "CREATE TABLE transaction_test (id INTEGER PRIMARY KEY, name TEXT)",
      );

      await db.transaction(async (tx: any) => {
        await tx.execute("INSERT INTO transaction_test (name) VALUES (?)", [
          "Alice",
        ]);
      });

      const rows = await db.query("SELECT * FROM transaction_test");
      return rows;
    });

    expect(result).toEqual([{ id: 1, name: "Alice" }]);
  });

  test("should rollback a transaction on error", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const dbName = "test-transaction-db-rollback";
      const db = new (window as any).NeverChangeDB(dbName);
      await db.init();

      await db.execute("DROP TABLE IF EXISTS transaction_test_rollback");
      await db.execute(
        "CREATE TABLE transaction_test_rollback (id INTEGER PRIMARY KEY, name TEXT)",
      );

      try {
        await db.transaction(async (tx: any) => {
          await tx.execute(
            "INSERT INTO transaction_test_rollback (name) VALUES (?)",
            ["Bob"],
          );

          // not exist table -> error
          await tx.query("SELECT * FROM non_existent_table");
        });
      } catch (err) {
        // this is expected (ROLLBACK occurred)
      }

      // transaction is rolled back, and the inserted record is deleted
      const rows = await db.query("SELECT * FROM transaction_test_rollback");
      return rows;
    });

    // the inserted data is rolled back (result is empty array)
    expect(result).toEqual([]);
  });

  test("should rollback when rollback() is called explicitly", async ({
    page,
  }) => {
    // call rollback() in the middle of the transaction -> error
    const result = await page.evaluate(async () => {
      const dbName = "test-transaction-db-explicit-rollback";
      const db = new (window as any).NeverChangeDB(dbName);
      await db.init();

      await db.execute("DROP TABLE IF EXISTS transaction_test_explicit");
      await db.execute(
        "CREATE TABLE transaction_test_explicit (id INTEGER PRIMARY KEY, value TEXT)",
      );

      try {
        await db.transaction(async (tx: any) => {
          await tx.execute(
            "INSERT INTO transaction_test_explicit (value) VALUES (?)",
            ["First Insert"],
          );

          // want to rollback in some condition -> rollback()
          await tx.rollback();

          // after rollback(), the processing is not executed
          await tx.execute(
            "INSERT INTO transaction_test_explicit (value) VALUES ('Second Insert')",
          );
        });
      } catch (err) {
        // rollback() explicitly throws an error
      }

      // because rollback() is explicitly called, the data is not inserted
      return await db.query("SELECT * FROM transaction_test_explicit");
    });

    // the data is not inserted
    expect(result).toEqual([]);
  });

  test("should handle nested transactions (savepoints)", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const dbName = "test-nested-transactions";
      const db = new (window as any).NeverChangeDB(dbName);
      await db.init();

      await db.execute("DROP TABLE IF EXISTS nested_test");
      await db.execute(
        "CREATE TABLE nested_test (id INTEGER PRIMARY KEY, name TEXT)",
      );

      // top-level transaction
      await db.transaction(async (tx: any) => {
        await tx.execute("INSERT INTO nested_test (name) VALUES (?)", [
          "Top-level 1",
        ]);

        // nested transaction (SAVEPOINT)
        try {
          await tx.transaction(async (tx2: any) => {
            await tx2.execute("INSERT INTO nested_test (name) VALUES (?)", [
              "Nested 1",
            ]);
            // intentionally throw an error
            throw new Error("Something wrong in nested transaction!");
          });
        } catch (err) {
          // an error occurred in the nested transaction, so it is rolled back to the SAVEPOINT
        }

        // top-level is still ongoing, and another record is inserted
        await tx.execute("INSERT INTO nested_test (name) VALUES (?)", [
          "Top-level 2",
        ]);
      });

      // the INSERT in the nested transaction ( "Nested 1" ) is rolled back
      return await db.query("SELECT * FROM nested_test ORDER BY id");
    });

    // the result contains only "Top-level 1" and "Top-level 2"
    expect(result).toEqual([
      { id: 1, name: "Top-level 1" },
      { id: 2, name: "Top-level 2" },
    ]);
  });

  test("should throw error if manually calling BEGIN and then db.commit()", async ({
    page,
  }) => {
    const errorMsg = await page.evaluate(async () => {
      const dbName = "test-manual-begin-commit";
      const db = new (window as any).NeverChangeDB(dbName);
      await db.init();

      await db.execute("DROP TABLE IF EXISTS manual_test");
      await db.execute(
        "CREATE TABLE manual_test (id INTEGER PRIMARY KEY, name TEXT)",
      );

      try {
        // 手動で BEGIN TRANSACTION 実行
        await db.execute("BEGIN TRANSACTION");
        // トランザクション深度(transactionDepth) は上がらない

        // ここで db.commit() を呼ぶと
        // "commit() called but no active transaction exists." とエラーになるはず
        await db.commit();
        return "No error thrown";
      } catch (err: any) {
        return err.message;
      } finally {
        await db.close();
      }
    });

    // 実際に「commit() called but no active transaction exists.」等のエラーが返ってくるはず
    expect(errorMsg).toMatch(
      /commit\(\) called but no active transaction exists\./,
    );
  });

  test("should throw error if manually calling BEGIN and then db.rollback()", async ({
    page,
  }) => {
    const errorMsg = await page.evaluate(async () => {
      const dbName = "test-manual-begin-rollback";
      const db = new (window as any).NeverChangeDB(dbName);
      await db.init();

      try {
        // manually call BEGIN TRANSACTION
        await db.execute("BEGIN TRANSACTION");
        // transactionDepth is not incremented

        // when db.rollback() is called,
        // "rollback() called but no active transaction exists." should be returned
        await db.rollback();
        return "No error thrown";
      } catch (err: any) {
        return err.message;
      } finally {
        await db.close();
      }
    });

    expect(errorMsg).toMatch(
      /rollback\(\) called but no active transaction exists\./,
    );
  });
});
