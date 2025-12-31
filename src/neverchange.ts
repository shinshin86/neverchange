/// <reference path="./index.d.ts" />
import { sqlite3Worker1Promiser } from "@sqlite.org/sqlite-wasm";
import {
  ExecuteResult,
  QueryResult,
  NeverChangeDB as INeverChangeDB,
  Migration,
} from "./types";
import { initialMigration } from "./migrations";
import { parseCSVRecords } from "./parser";

// unique ID for each savepoint
let SAVEPOINT_ID = 0;

export class NeverChangeDB implements INeverChangeDB {
  private dbPromise: Promise<
    (command: string, params: any) => Promise<any>
  > | null = null;
  private dbId: string | null = null;
  private migrations: Migration[] = [];

  private transactionDepth = 0;
  private savepointStack: string[] = [];

  constructor(
    private dbName: string,
    private options: { debug?: boolean; isMigrationActive?: boolean } = {},
  ) {
    this.options.debug = options.debug ?? false;
    this.options.isMigrationActive = options.isMigrationActive ?? true;

    if (this.options.isMigrationActive) {
      this.addMigrations([initialMigration]);
    }
  }

  private log(...args: any[]): void {
    if (this.options.debug) {
      console.log(...args);
    }
  }

  async init(): Promise<void> {
    if (this.dbPromise) return;

    try {
      this.dbPromise = this.initializeDatabase();
      await this.dbPromise;

      if (this.options.isMigrationActive) {
        await this.createMigrationTable();
        await this.runMigrations();
      }
    } catch (err) {
      console.error("Failed to initialize database:", err);
      throw err;
    }
  }

  private async initializeDatabase(): Promise<
    (command: string, params: any) => Promise<any>
  > {
    this.log("Loading and initializing SQLite3 module...");

    const promiser = await this.getPromiser();
    this.log("Done initializing. Opening database...");

    const openResponse = await this.openDatabase(promiser);
    this.dbId = openResponse.result.dbId;

    this.log("Database initialized successfully");
    return promiser;
  }

  private async getPromiser(): Promise<
    (command: string, params: any) => Promise<any>
  > {
    return new Promise<(command: string, params: any) => Promise<any>>(
      (resolve) => {
        sqlite3Worker1Promiser({
          onready: (promiser: (command: string, params: any) => Promise<any>) =>
            resolve(promiser),
        });
      },
    );
  }

  private async openDatabase(
    promiser: (command: string, params: any) => Promise<any>,
  ): Promise<any> {
    try {
      const response = await promiser("open", {
        filename: `file:${this.dbName}.sqlite3?vfs=opfs`,
      });
      this.log("OPFS database opened:", response.result.filename);
      return response;
    } catch (opfsError) {
      console.warn(
        "OPFS is not available, falling back to in-memory database:",
        opfsError,
      );
      const response = await promiser("open", { filename: ":memory:" });
      this.log("In-memory database opened");
      return response;
    }
  }

  async execute(sql: string, params: any[] = []): Promise<ExecuteResult> {
    try {
      const promiser = await this.getPromiserOrThrow();
      return await promiser("exec", { sql, bind: params, dbId: this.dbId });
    } catch (error) {
      console.error("Error executing SQL:", error);
      throw error;
    }
  }

  async query<T = any>(
    sql: string,
    params: any[] = [],
  ): Promise<QueryResult<T>> {
    const promiser = await this.getPromiserOrThrow();
    const result = await promiser("exec", {
      sql,
      bind: params,
      rowMode: "object",
      dbId: this.dbId,
    });
    return result.result.resultRows || [];
  }

  async close(): Promise<void> {
    if (this.dbId) {
      const promiser = await this.getPromiserOrThrow();
      await promiser("close", { dbId: this.dbId });
      this.dbId = null;
      this.dbPromise = null;
    }
  }

  addMigrations(migrations: Migration[]): void {
    this.migrations.push(...migrations);
    this.migrations.sort((a, b) => a.version - b.version);
  }

  private async createMigrationTable(): Promise<void> {
    await this.execute(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  private async getCurrentVersion(): Promise<number> {
    const tables = await this.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table'",
    );
    if (!tables.some((t) => t.name === "migrations")) return 0;

    const result = await this.query<{ version: number }>(
      "SELECT MAX(version) as version FROM migrations",
    );
    return result[0]?.version || 0;
  }

  private async runMigrations(): Promise<void> {
    const currentVersion = await this.getCurrentVersion();
    const pendingMigrations = this.migrations.filter(
      (m) => m.version > currentVersion,
    );

    for (const migration of pendingMigrations) {
      this.log(`Running migration to version ${migration.version}`);
      await migration.up(this);
      await this.execute("INSERT INTO migrations (version) VALUES (?)", [
        migration.version,
      ]);
      this.log(`Migration to version ${migration.version} completed`);
    }
  }

  private async getPromiserOrThrow(): Promise<
    (command: string, params: any) => Promise<any>
  > {
    if (!this.dbPromise) {
      throw new Error("Database not initialized. Call init() first.");
    }
    return this.dbPromise;
  }

  private escapeBlob(blob: Uint8Array): string {
    return `X'${Array.from(new Uint8Array(blob), (byte) => byte.toString(16).padStart(2, "0")).join("")}'`;
  }

  async dumpDatabase(
    options: { compatibilityMode?: boolean; table?: string } = {},
  ): Promise<string> {
    const { compatibilityMode = false, table } = options;

    let dumpOutput = "";

    if (compatibilityMode) {
      dumpOutput += `PRAGMA foreign_keys = OFF;\nBEGIN TRANSACTION;\n\n`;
    }

    // Get all database objects or just the specified table
    const objectsQuery = table
      ? `SELECT type, name, sql FROM sqlite_master WHERE type='table' AND name = ?`
      : `SELECT type, name, sql FROM sqlite_master WHERE sql NOT NULL AND name != 'sqlite_sequence'`;

    const objects = await this.query<{
      type: string;
      name: string;
      sql: string | null;
    }>(objectsQuery, table ? [table] : []);

    // Dump table contents
    for (const obj of objects) {
      if (obj.type === "table") {
        dumpOutput += `${obj.sql};\n`;

        // Dump table contents
        const rows = await this.query(`SELECT * FROM ${obj.name}`);
        for (const row of rows) {
          const columns = Object.keys(row).join(", ");
          const values = Object.values(row)
            .map((value) => {
              if (value instanceof Uint8Array) {
                return this.escapeBlob(value);
              } else if (value === null) {
                return "NULL";
              } else if (typeof value === "string") {
                return `'${value.replace(/'/g, "''")}'`;
              }
              return value;
            })
            .join(", ");

          dumpOutput += `INSERT INTO ${obj.name} (${columns}) VALUES (${values});\n`;
        }
        dumpOutput += "\n";
      }
    }

    // Handle sqlite_sequence separately if no specific table is specified
    if (!table) {
      try {
        const seqRows = await this.query<{ name: string; seq: number }>(
          `SELECT * FROM sqlite_sequence`,
        );
        if (seqRows.length > 0) {
          dumpOutput += `DELETE FROM sqlite_sequence;\n`;
          for (const row of seqRows) {
            dumpOutput += `INSERT INTO sqlite_sequence VALUES('${row.name}', ${row.seq});\n`;
          }
          dumpOutput += "\n";
        }
      } catch (error) {
        this.log("sqlite_sequence table does not exist, skipping...");
      }
    }

    // Add other database objects (views, indexes, triggers) if no specific table is specified
    if (!table) {
      for (const obj of objects) {
        if (obj.type !== "table") {
          dumpOutput += `${obj.sql};\n\n`;
        }
      }
    }

    if (compatibilityMode) {
      dumpOutput += `COMMIT;\n`;
    }

    return dumpOutput;
  }

  async importDump(
    dumpContent: string,
    options: { compatibilityMode?: boolean } = {},
  ): Promise<void> {
    const { compatibilityMode = false } = options;
    const statements = dumpContent
      .split(";")
      .map((stmt) => stmt.trim())
      .filter(Boolean);

    if (!compatibilityMode) {
      await this.execute("PRAGMA foreign_keys=OFF");
      await this.execute("BEGIN TRANSACTION");
    }

    try {
      // Drop all existing tables, views, and indexes
      const existingObjects = await this.query<{ type: string; name: string }>(`
          SELECT type, name FROM sqlite_master WHERE type IN ('table', 'view', 'index') AND name != 'sqlite_sequence'
        `);
      for (const { type, name } of existingObjects) {
        await this.execute(`DROP ${type} IF EXISTS ${name}`);
      }

      // Execute all statements from the dump
      for (const statement of statements) {
        if (statement !== "COMMIT") {
          // Skip the final COMMIT statement
          await this.execute(statement);
        }
      }

      if (!compatibilityMode) {
        await this.execute("COMMIT");
        await this.execute("PRAGMA foreign_keys = ON");
      }
    } catch (error) {
      if (!compatibilityMode) {
        await this.execute("ROLLBACK");
        await this.execute("PRAGMA foreign_keys = ON");
      }

      throw error;
    }
  }

  async dumpTableToCSV(
    tableName: string,
    options: { quoteAllFields?: boolean } = {},
  ): Promise<string> {
    const rows = await this.query(`SELECT * FROM ${tableName}`);

    const columnNames = Object.keys(
      rows[0] ||
        (await this.query(`PRAGMA table_info(${tableName})`)).reduce(
          (acc: any, col: any) => ({ ...acc, [col.name]: "" }),
          {},
        ),
    )
      .map((col) => (options.quoteAllFields ? `"${col}"` : col))
      .join(",");

    if (rows.length === 0) {
      return `${columnNames}\r\n`;
    }

    const escapeCSVField = (field: any): string => {
      const strValue = field?.toString() || "";
      const needsQuoting =
        options.quoteAllFields ||
        strValue.includes(",") ||
        strValue.includes("\n") ||
        strValue.includes('"');

      if (needsQuoting) {
        return `"${strValue.replace(/"/g, '""')}"`;
      }

      return strValue;
    };

    const csvRows = rows.map((row) =>
      Object.values(row).map(escapeCSVField).join(","),
    );

    return `${columnNames}\r\n${csvRows.join("\r\n")}\r\n`;
  }

  async importCSVToTable(tableName: string, csvContent: string): Promise<void> {
    const records = parseCSVRecords(csvContent);
    if (records.length === 0) return;
    const [header, ...rows] = records;
    const columns = header;

    for (const row of rows) {
      if (row.length === 0) continue;
      const placeholders = columns.map(() => "?").join(",");

      await this.execute(
        `INSERT INTO ${tableName} (${columns.join(",")}) VALUES (${placeholders})`,
        row,
      );
    }
  }

  /**
   * execute a transaction.
   * - if it's top-level, it will be a top-level transaction.
   * - if it's nested, it will be a nested transaction.
   */
  async transaction<T>(fn: (tx: NeverChangeDB) => Promise<T>): Promise<T> {
    if (this.transactionDepth === 0) {
      // top-level transaction
      await this.execute("BEGIN TRANSACTION");
      this.transactionDepth = 1;
      this.log("BEGIN TRANSACTION (top-level)");

      try {
        const result = await fn(this);
        await this.execute("COMMIT");
        this.log("COMMIT (top-level)");
        this.transactionDepth = 0;
        return result;
      } catch (err) {
        await this.execute("ROLLBACK");
        this.log("ROLLBACK (top-level)");
        this.transactionDepth = 0;
        throw err;
      }
    } else {
      // nested transaction
      this.transactionDepth++;
      const savepointName = `sp_${SAVEPOINT_ID++}`;
      this.savepointStack.push(savepointName);

      this.log(`BEGIN NESTED TRANSACTION: SAVEPOINT ${savepointName}`);
      await this.execute(`SAVEPOINT ${savepointName}`);

      try {
        const result = await fn(this);
        this.log(`RELEASE SAVEPOINT ${savepointName}`);
        await this.execute(`RELEASE SAVEPOINT ${savepointName}`);

        this.savepointStack.pop();
        this.transactionDepth--;
        return result;
      } catch (err) {
        // rollback to savepoint
        this.log(`ROLLBACK TO ${savepointName}`);
        await this.execute(`ROLLBACK TO ${savepointName}`);
        this.savepointStack.pop();
        this.transactionDepth--;
        throw err;
      }
    }
  }

  /**
   * explicitly rollback the current transaction.
   * - if it's top-level, it will rollback all changes.
   * - if it's nested, it will rollback to the last created savepoint.
   */
  async rollback(): Promise<never> {
    if (this.transactionDepth <= 0) {
      throw new Error("rollback() called but no active transaction exists.");
    }

    if (this.transactionDepth === 1) {
      // top-level transaction
      this.log("ROLLBACK (top-level)");
      await this.execute("ROLLBACK");
      this.transactionDepth = 0;
      throw new Error("Transaction rolled back (top-level).");
    } else {
      // nested transaction
      const savepointName = this.savepointStack.pop();
      this.transactionDepth--;

      if (!savepointName) {
        throw new Error("rollback() called but no matching savepoint found.");
      }

      this.log(`ROLLBACK TO ${savepointName} (nested)`);
      await this.execute(`ROLLBACK TO ${savepointName}`);

      throw new Error(`Transaction rolled back to savepoint ${savepointName}.`);
    }
  }

  /**
   * if you want to commit explicitly, you can call this method.
   * (but it will be committed automatically when the transaction(cb) ends.)
   */
  async commit(): Promise<void> {
    if (this.transactionDepth <= 0) {
      throw new Error("commit() called but no active transaction exists.");
    }

    if (this.transactionDepth === 1) {
      // top-level commit
      await this.execute("COMMIT");
      this.log("COMMIT (top-level)");
      this.transactionDepth = 0;
    } else {
      // nested transaction
      const savepointName = this.savepointStack.pop();
      this.transactionDepth--;
      if (!savepointName) {
        throw new Error("commit() called but no matching savepoint found.");
      }
      this.log(`RELEASE SAVEPOINT ${savepointName} (nested by user)`);
      await this.execute(`RELEASE SAVEPOINT ${savepointName}`);
    }
  }
}
