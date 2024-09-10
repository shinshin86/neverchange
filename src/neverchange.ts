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
  private debug: boolean;
  private isMigrationActive: boolean;
  private migrations: Migration[] = [];

  constructor(
    private dbName: string,
    options: { debug?: boolean; isMigrationActive?: boolean } = {},
  ) {
    this.debug = options.debug ?? false;

    // isMigrationActive is default true
    this.isMigrationActive = options.isMigrationActive ?? true;
    if (this.isMigrationActive) {
      this.addMigrations([initialMigration]);
    }
  }

  protected log(...args: any[]): void {
    if (this.debug) {
      console.log(...args);
    }
  }

  async init(): Promise<void> {
    if (this.dbPromise) return;

    this.dbPromise = new Promise(async (resolve, reject) => {
      try {
        this.log("Loading and initializing SQLite3 module...");

        const promiser = (await new Promise<unknown>((resolve) => {
          const _promiser = sqlite3Worker1Promiser({
            onready: () => resolve(_promiser),
          });
        })) as (command: string, params: any) => Promise<any>;

        this.log("Done initializing. Opening database...");

        // OPFS
        let openResponse;
        try {
          openResponse = await promiser("open", {
            filename: `file:${this.dbName}.sqlite3?vfs=opfs`,
          });
          this.log("OPFS database opened:", openResponse.result.filename);
        } catch (opfsError) {
          console.warn(
            "OPFS is not available, falling back to in-memory database:",
            opfsError,
          );
          openResponse = await promiser("open", {
            filename: ":memory:",
          });
          this.log("In-memory database opened");
        }

        this.dbId = openResponse.result.dbId;

        this.log("Database initialized successfully");
        resolve(promiser);
      } catch (err) {
        console.error("Failed to initialize database:", err);
        reject(err);
      }
    });

    if (this.isMigrationActive) {
      await this.createMigrationTable();
      await this.runMigrations();
    }
  }

  private async getPromiser(): Promise<
    (command: string, params: any) => Promise<any>
  > {
    if (!this.dbPromise) {
      throw new Error("Database not initialized. Call init() first.");
    }
    return this.dbPromise;
  }

  async execute(sql: string, params: any[] = []): Promise<ExecuteResult> {
    try {
      const promiser = await this.getPromiser();
      const r = await promiser("exec", {
        sql,
        bind: params,
        dbId: this.dbId,
      });
      return r;
    } catch (error) {
      console.error("Error executing SQL:", error);
      throw error;
    }
  }

  async query<T = any>(
    sql: string,
    params: any[] = [],
  ): Promise<QueryResult<T>> {
    const promiser = await this.getPromiser();
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
      const promiser = await this.getPromiser();
      await promiser("close", { dbId: this.dbId });
      this.dbId = null;
      this.dbPromise = null;
    }
  }

  addMigrations(migrations: Migration[]): void {
    this.migrations.push(...migrations);
    // sort migrations by version
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
    // if migrations table does not exist, return 0
    const tables = await this.query(
      "SELECT name FROM sqlite_master WHERE type='table'",
    );
    const tableNames = tables.map((t) => t.name);
    if (!tableNames.includes("migrations")) {
      return 0;
    }

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
}
