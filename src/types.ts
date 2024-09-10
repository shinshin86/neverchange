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
}

export interface NeverChangeDBConstructor {
  new (dbName: string, options?: { debug?: boolean }): NeverChangeDB;
}

export interface Migration {
  version: number;
  up: (db: NeverChangeDB) => Promise<void>;
}
