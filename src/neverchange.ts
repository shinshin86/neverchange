/// <reference path="./index.d.ts" />
import { sqlite3Worker1Promiser } from "@sqlite.org/sqlite-wasm";
import {
  ExecuteResult,
  QueryResult,
  NeverChangeDB as INeverChangeDB,
  Migration,
} from "./types";
import { initialMigration } from "./migrations";

export class NeverChangeDB implements INeverChangeDB {
  private dbPromise: Promise<
    (command: string, params: any) => Promise<any>
  > | null = null;
  private dbId: string | null = null;
  private migrations: Migration[] = [];

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

  async dumpDatabase(
    options: { compatibilityMode?: boolean } = {},
  ): Promise<string> {
    const { compatibilityMode = false } = options;

    let dumpOutput = "";

    if (compatibilityMode) {
      dumpOutput += `PRAGMA foreign_keys = OFF;\nBEGIN TRANSACTION;\n\n`;
    }

    // Get all database objects
    const objects = await this.query<{
      type: string;
      name: string;
      sql: string | null;
    }>(`
        SELECT type, name, sql FROM sqlite_master
        WHERE sql NOT NULL AND name != 'sqlite_sequence'
      `);

    // Dump table contents
    for (const obj of objects) {
      if (obj.type === "table") {
        dumpOutput += `${obj.sql};\n`;

        // Dump table contents
        const rows = await this.query(`SELECT * FROM ${obj.name}`);
        for (const row of rows) {
          const columns = Object.keys(row).join(", ");
          const values = Object.values(row)
            .map((value) =>
              value === null
                ? "NULL"
                : typeof value === "string"
                  ? `'${value.replace(/'/g, "''")}'`
                  : value,
            )
            .join(", ");

          dumpOutput += `INSERT INTO ${obj.name} (${columns}) VALUES (${values});\n`;
        }
        dumpOutput += "\n";
      }
    }

    // Handle sqlite_sequence separately
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

    // Add other database objects (views, indexes, triggers)
    for (const obj of objects) {
      if (obj.type !== "table") {
        dumpOutput += `${obj.sql};\n\n`;
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
}
