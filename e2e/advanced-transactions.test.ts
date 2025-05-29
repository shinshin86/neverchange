import { test, expect } from "@playwright/test";

// sleep function for debugging
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test.describe("NeverChangeDB Advanced Transactions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await sleep(100);
  });

  test("should return values from transaction callback", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("transaction-return-db");
      await db.init();

      await db.execute(`
        CREATE TABLE accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          balance INTEGER NOT NULL
        )
      `);

      await db.execute("INSERT INTO accounts (name, balance) VALUES (?, ?)", [
        "Alice",
        1000,
      ]);

      // Transaction that returns a value
      const updatedBalance = await db.transaction(async (tx: any) => {
        await tx.execute(
          "UPDATE accounts SET balance = balance - 50 WHERE name = ?",
          ["Alice"],
        );
        const [row] = await tx.query(
          "SELECT balance FROM accounts WHERE name = ?",
          ["Alice"],
        );
        return row.balance;
      });

      await db.close();
      return updatedBalance;
    });

    expect(result).toBe(950);
  });

  test("should handle multiple levels of nested transactions", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("multi-nested-db");
      await db.init();

      await db.execute(`
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          level TEXT NOT NULL,
          value TEXT NOT NULL
        )
      `);

      await db.transaction(async (tx1: any) => {
        await tx1.execute(
          "INSERT INTO test_table (level, value) VALUES (?, ?)",
          ["level1", "data1"],
        );

        await tx1.transaction(async (tx2: any) => {
          await tx2.execute(
            "INSERT INTO test_table (level, value) VALUES (?, ?)",
            ["level2", "data2"],
          );

          await tx2.transaction(async (tx3: any) => {
            await tx3.execute(
              "INSERT INTO test_table (level, value) VALUES (?, ?)",
              ["level3", "data3"],
            );

            // This nested transaction will succeed
          });

          // Continue with level2 transaction
          await tx2.execute(
            "INSERT INTO test_table (level, value) VALUES (?, ?)",
            ["level2", "data2b"],
          );
        });

        // Continue with level1 transaction
        await tx1.execute(
          "INSERT INTO test_table (level, value) VALUES (?, ?)",
          ["level1", "data1b"],
        );
      });

      const rows = await db.query("SELECT * FROM test_table ORDER BY id");
      await db.close();
      return rows;
    });

    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({ id: 1, level: "level1", value: "data1" });
    expect(result[1]).toEqual({ id: 2, level: "level2", value: "data2" });
    expect(result[2]).toEqual({ id: 3, level: "level3", value: "data3" });
    expect(result[3]).toEqual({ id: 4, level: "level2", value: "data2b" });
    expect(result[4]).toEqual({ id: 5, level: "level1", value: "data1b" });
  });

  test("should handle nested transaction rollback correctly", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("nested-rollback-db");
      await db.init();

      await db.execute(`
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          level TEXT NOT NULL,
          value TEXT NOT NULL
        )
      `);

      await db.transaction(async (tx1: any) => {
        await tx1.execute(
          "INSERT INTO test_table (level, value) VALUES (?, ?)",
          ["level1", "data1"],
        );

        try {
          await tx1.transaction(async (tx2: any) => {
            await tx2.execute(
              "INSERT INTO test_table (level, value) VALUES (?, ?)",
              ["level2", "data2"],
            );

            try {
              await tx2.transaction(async (tx3: any) => {
                await tx3.execute(
                  "INSERT INTO test_table (level, value) VALUES (?, ?)",
                  ["level3", "data3"],
                );

                // Force an error in the deepest nested transaction
                throw new Error("Intentional error in level3");
              });
            } catch (err) {
              // Level3 transaction is rolled back, but level2 continues
            }

            // Continue with level2 transaction after level3 rollback
            await tx2.execute(
              "INSERT INTO test_table (level, value) VALUES (?, ?)",
              ["level2", "data2b"],
            );
          });
        } catch (err) {
          // This shouldn't happen as level2 transaction should succeed
        }

        // Continue with level1 transaction
        await tx1.execute(
          "INSERT INTO test_table (level, value) VALUES (?, ?)",
          ["level1", "data1b"],
        );
      });

      const rows = await db.query("SELECT * FROM test_table ORDER BY id");
      await db.close();
      return rows;
    });

    // Level3 data should be rolled back, but level1 and level2 data should remain
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ id: 1, level: "level1", value: "data1" });
    expect(result[1]).toEqual({ id: 2, level: "level2", value: "data2" });
    expect(result[2]).toEqual({ id: 3, level: "level2", value: "data2b" });
    expect(result[3]).toEqual({ id: 4, level: "level1", value: "data1b" });
  });

  test("should handle manual commit in nested transaction", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("manual-commit-nested-db");
      await db.init();

      await db.execute(`
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          value TEXT NOT NULL
        )
      `);

      try {
        await db.transaction(async (tx1: any) => {
          await tx1.execute("INSERT INTO test_table (value) VALUES (?)", [
            "outer1",
          ]);

          try {
            await tx1.transaction(async (tx2: any) => {
              await tx2.execute("INSERT INTO test_table (value) VALUES (?)", [
                "inner1",
              ]);

              // Manual commit of nested transaction (releases savepoint)
              await tx2.commit();

              // This will still execute as the transaction context continues
              await tx2.execute("INSERT INTO test_table (value) VALUES (?)", [
                "inner2",
              ]);
            });
          } catch (err) {
            // Handle any errors from nested transaction
          }

          await tx1.execute("INSERT INTO test_table (value) VALUES (?)", [
            "outer2",
          ]);
        });
      } catch (err) {
        // Handle any transaction errors
      }

      const rows = await db.query("SELECT * FROM test_table ORDER BY id");
      await db.close();
      return rows;
    });

    // Should have outer1, inner1, inner2, and outer2 (manual commit releases savepoint but doesn't end transaction context)
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ id: 1, value: "outer1" });
    expect(result[1]).toEqual({ id: 2, value: "inner1" });
    expect(result[2]).toEqual({ id: 3, value: "inner2" });
    expect(result[3]).toEqual({ id: 4, value: "outer2" });
  });

  test("should handle manual rollback in nested transaction", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("manual-rollback-nested-db");
      await db.init();

      await db.execute(`
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          value TEXT NOT NULL
        )
      `);

      try {
        await db.transaction(async (tx1: any) => {
          await tx1.execute("INSERT INTO test_table (value) VALUES (?)", [
            "outer1",
          ]);

          try {
            await tx1.transaction(async (tx2: any) => {
              await tx2.execute("INSERT INTO test_table (value) VALUES (?)", [
                "inner1",
              ]);

              // Manual rollback of nested transaction (this throws an error and rolls back to savepoint)
              await tx2.rollback();

              // This should not be executed after manual rollback (unreachable due to exception)
              await tx2.execute("INSERT INTO test_table (value) VALUES (?)", [
                "inner2",
              ]);
            });
          } catch (err) {
            // Expected error from manual rollback - inner1 is rolled back
          }

          await tx1.execute("INSERT INTO test_table (value) VALUES (?)", [
            "outer2",
          ]);
        });
      } catch (err) {
        // Handle any transaction errors
      }

      const rows = await db.query("SELECT * FROM test_table ORDER BY id");
      await db.close();
      return rows;
    });

    // Should have outer1 and outer2 (inner1 should be rolled back due to manual rollback)
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 1, value: "outer1" });
    expect(result[1]).toEqual({ id: 2, value: "outer2" });
  });

  test("should handle transaction with complex return values", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("complex-return-db");
      await db.init();

      await db.execute(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          balance INTEGER NOT NULL
        )
      `);

      await db.execute("INSERT INTO users (name, balance) VALUES (?, ?)", [
        "Alice",
        1000,
      ]);
      await db.execute("INSERT INTO users (name, balance) VALUES (?, ?)", [
        "Bob",
        500,
      ]);

      // Transaction that returns complex data
      const transferResult = await db.transaction(async (tx: any) => {
        const transferAmount = 200;

        // Deduct from Alice
        await tx.execute(
          "UPDATE users SET balance = balance - ? WHERE name = ?",
          [transferAmount, "Alice"],
        );
        const [aliceAccount] = await tx.query(
          "SELECT * FROM users WHERE name = ?",
          ["Alice"],
        );

        // Add to Bob
        await tx.execute(
          "UPDATE users SET balance = balance + ? WHERE name = ?",
          [transferAmount, "Bob"],
        );
        const [bobAccount] = await tx.query(
          "SELECT * FROM users WHERE name = ?",
          ["Bob"],
        );

        return {
          transferAmount,
          alice: aliceAccount,
          bob: bobAccount,
          timestamp: new Date().toISOString(),
        };
      });

      await db.close();
      return transferResult;
    });

    expect(result.transferAmount).toBe(200);
    expect(result.alice.balance).toBe(800);
    expect(result.bob.balance).toBe(700);
    expect(result.timestamp).toBeDefined();
  });

  test("should handle concurrent-like transaction operations", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const db = new (window as any).NeverChangeDB("concurrent-like-db");
      await db.init();

      await db.execute(`
        CREATE TABLE counter (
          id INTEGER PRIMARY KEY,
          value INTEGER NOT NULL
        )
      `);

      await db.execute("INSERT INTO counter (id, value) VALUES (1, 0)");

      // Simulate multiple transaction operations
      const results: number[] = [];

      for (let i = 0; i < 5; i++) {
        const result = await db.transaction(async (tx: any) => {
          const [current] = await tx.query(
            "SELECT value FROM counter WHERE id = 1",
          );
          const newValue = current.value + 1;
          await tx.execute("UPDATE counter SET value = ? WHERE id = 1", [
            newValue,
          ]);
          return newValue;
        });
        results.push(result);
      }

      const [finalCounter] = await db.query(
        "SELECT value FROM counter WHERE id = 1",
      );
      await db.close();

      return { results, finalValue: finalCounter.value };
    });

    expect(result.results).toEqual([1, 2, 3, 4, 5]);
    expect(result.finalValue).toBe(5);
  });
});
