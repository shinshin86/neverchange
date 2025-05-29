export interface SQLiteExecutionResult {
  type: string;
  dbId: string;
  messageId: string;
  workerReceivedTime: number;
  workerRespondTime: number;
  departureTime: number;
  result: {
    sql: string;
    bind: any[];
    dbId: string;
  };
}

export type ExecuteResult = {
  r: SQLiteExecutionResult;
};

export type QueryResult<T> = T[];

export interface NeverChangeDB {
  init(): Promise<void>;
  execute(sql: string, params?: any[]): Promise<ExecuteResult>;
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  close(): Promise<void>;
  addMigrations(migrations: Migration[]): void;
  dumpDatabase(options?: {
    compatibilityMode?: boolean;
    table?: string;
  }): Promise<string>;
  importDump(
    dumpContent: string,
    options?: { compatibilityMode?: boolean },
  ): Promise<void>;
  dumpTableToCSV(
    tableName: string,
    options?: { quoteAllFields?: boolean },
  ): Promise<string>;
  importCSVToTable(tableName: string, csvContent: string): Promise<void>;
  transaction<T>(fn: (tx: NeverChangeDB) => Promise<T>): Promise<T>;
  rollback(): Promise<never>;
  commit(): Promise<void>;
}

export interface NeverChangeDBConstructor {
  new (
    dbName: string,
    options?: { debug?: boolean; isMigrationActive?: boolean },
  ): NeverChangeDB;
}

export interface Migration {
  version: number;
  up: (db: NeverChangeDB) => Promise<void>;
}
