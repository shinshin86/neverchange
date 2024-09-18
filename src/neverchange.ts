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
}
